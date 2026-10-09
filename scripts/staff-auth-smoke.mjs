import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import Database from "better-sqlite3";
import { SignJWT } from "jose";

const directory = mkdtempSync(join(tmpdir(), "zdayka-staff-test-"));
const dbPath = join(directory, "test.sqlite");
const port = 31000 + Math.floor(Math.random() * 15000);
const origin = `http://127.0.0.1:${port}`;
const secret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const managerPassword = randomBytes(24).toString("base64url");
const managerSalt = randomBytes(16).toString("hex");
const managerHash = `scrypt:${managerSalt}:${scryptSync(managerPassword, managerSalt, 64).toString("hex")}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: process.cwd(), stdio: "ignore", env: { ...process.env, APP_ORIGIN: origin, SESSION_SECRET: secret, DB_PATH: dbPath,
    STAFF_OWNER_LOGIN: "smoke-owner", STAFF_OWNER_PASSWORD_HASH: hash, STAFF_MANAGER_LOGIN: "smoke-manager", STAFF_MANAGER_PASSWORD_HASH: managerHash,
    PUBLIC_LAUNCH_ENABLED: "0", NOTIFICATIONS_ENABLED: "0" }
});

function check(value, message) { if (!value) throw new Error(message); }
async function get(path, cookie) { return fetch(origin + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" }); }
async function login(username, candidate, requestOrigin = origin) {
  return fetch(origin + "/api/auth/staff", { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: candidate }), redirect: "manual" });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error("Production server exited before startup");
    try { const response = await get("/admin"); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  check(ready, "Production server did not start");
  const guestAdmin = await (await get("/admin")).text();
  check(guestAdmin.includes("Вхід в адмінку"), "Guest can access admin");
  const guestDemo = await (await get("/admin/demo")).text();
  check(guestDemo.includes("Вхід в адмінку") && !guestDemo.includes("Кабінет очима клієнта"), "Guest can access demo");
  check((await login("smoke-owner", password, "https://outside.example")).status === 403, "Cross-origin login accepted");
  check((await login("smoke-owner", "incorrect-password")).status === 401, "Incorrect password accepted");

  const database = new Database(dbPath);
  database.prepare("INSERT INTO users(id,name,role) VALUES(?,?,?)").run("telegram-owner-test", "Owner via Telegram", "owner");
  database.close();
  const telegramToken = await new SignJWT({ sub: "telegram-owner-test", auth_method: "telegram" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
  const telegramAdmin = await (await get("/admin", `zdayka_session=${telegramToken}`)).text();
  check(telegramAdmin.includes("Вхід в адмінку"), "Telegram owner session bypasses staff login");

  const response = await login("smoke-owner", password);
  check(response.ok, `Correct staff password rejected (${response.status})`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  check(cookie?.startsWith("zdayka_session="), "Staff session cookie missing");
  const staffAdmin = await (await get("/admin", cookie)).text();
  check(staffAdmin.includes("Заявки та замовлення"), "Staff cannot access admin");
  const staffDemo = await (await get("/admin/demo", cookie)).text();
  check(staffDemo.includes("Кабінет очима клієнта"), "Staff cannot access demo");
  const state = await (await get("/api/state", cookie)).json();
  check(state.user?.role === "owner" && state.stats, "Staff state is unavailable");
  const managerResponse = await login("smoke-manager", managerPassword);
  check(managerResponse.ok, "Manager login rejected");
  const managerCookie = managerResponse.headers.get("set-cookie")?.split(";")[0];
  const managerState = await (await get("/api/state", managerCookie)).json();
  check(managerState.user?.role === "manager" && !managerState.stats, "Manager can see owner totals");
  check((await (await get("/admin/demo", managerCookie)).text()).includes("Кабінет очима клієнта"), "Manager cannot access demo");
  console.log("Staff auth smoke passed: guest and Telegram role blocked, origin/password checked, owner and manager permissions verified.");
} finally {
  server.kill("SIGTERM");
  await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once("exit", resolve); setTimeout(resolve, 5000); });
  rmSync(directory, { recursive: true, force: true });
}
