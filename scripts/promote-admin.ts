import Database from "better-sqlite3";
import path from "node:path";

const email = process.argv[2];

if (!email) {
  console.error("Usage: pnpm tsx scripts/promote-admin.ts user@example.com");
  process.exit(1);
}

const databaseFile = process.env.AUTH_SQLITE_PATH ?? path.join(process.cwd(), "server", "auth.sqlite");
const db = new Database(databaseFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS admin_roles (
    user_id TEXT PRIMARY KEY,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

const user = db
  .prepare(`SELECT id, email FROM user WHERE lower(email) = lower(?) LIMIT 1`)
  .get(email) as { id: string; email: string } | undefined;

if (!user) {
  console.error(`User with email ${email} not found in auth database.`);
  process.exit(1);
}

const now = Date.now();
db.prepare(
  `INSERT INTO admin_roles (user_id, is_admin, created_at)
   VALUES (?, 1, ?)
   ON CONFLICT(user_id) DO UPDATE SET is_admin = 1`
).run(user.id, now);

console.log(`Promoted ${user.email} to admin.`);
