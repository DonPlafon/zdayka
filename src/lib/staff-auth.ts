import "server-only";
import { scryptSync, timingSafeEqual } from "node:crypto";

type StaffRole = "owner" | "manager";
const fallbackSalt = "zdayka-staff-fallback";
const fallbackDigest = scryptSync("unused-password", fallbackSalt, 64);

export function staffLoginConfigured() {
  return Boolean(process.env.STAFF_OWNER_LOGIN && process.env.STAFF_OWNER_PASSWORD_HASH);
}

export function verifyStaffPassword(username: string, password: string): StaffRole | null {
  const accounts: { role: StaffRole; login?: string; hash?: string }[] = [
    { role: "owner", login: process.env.STAFF_OWNER_LOGIN, hash: process.env.STAFF_OWNER_PASSWORD_HASH },
    { role: "manager", login: process.env.STAFF_MANAGER_LOGIN, hash: process.env.STAFF_MANAGER_PASSWORD_HASH }
  ];
  const account = accounts.find(candidate => candidate.login === username);
  const parts = account?.hash?.split(":");
  const validFormat = parts?.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const salt = validFormat ? parts![1] : fallbackSalt;
  const digest = validFormat ? Buffer.from(parts![2], "hex") : fallbackDigest;
  const actual = scryptSync(password, salt, 64);
  return account && validFormat && timingSafeEqual(actual, digest) ? account.role : null;
}
