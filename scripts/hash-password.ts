import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}
if (password.length < 10) console.warn("Tip: use at least 10 characters.");
const hash = bcrypt.hashSync(password, 12);
// Base64 so the "$" characters in bcrypt hashes survive .env variable expansion.
console.log(`APP_PASSWORD_HASH=${Buffer.from(hash).toString("base64")}`);
