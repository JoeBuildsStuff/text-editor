import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

const globalForAuthDb = globalThis as unknown as {
  authDb?: Database;
};

function getDatabase(): Database {
  if (!globalForAuthDb.authDb) {
    const databaseFile = process.env.AUTH_SQLITE_PATH ?? "auth.sqlite";
    globalForAuthDb.authDb = new Database(databaseFile);
    globalForAuthDb.authDb.pragma("journal_mode = WAL");
    globalForAuthDb.authDb.pragma("foreign_keys = ON");
  }
  return globalForAuthDb.authDb;
}

export const auth = betterAuth({
  database: getDatabase(),
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "",
});

