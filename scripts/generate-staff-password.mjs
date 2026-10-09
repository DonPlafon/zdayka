import { randomBytes, scryptSync } from "node:crypto";

const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const digest = scryptSync(password, salt, 64).toString("hex");
console.log(`Password: ${password}`);
console.log(`Password hash: scrypt:${salt}:${digest}`);
console.log("Keep the password private. Store only the hash in the server environment.");
