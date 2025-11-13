import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const globalForAuthDb = globalThis as unknown as {
  authDb?: Database.Database;
};

function getDatabase(): Database.Database {
  if (!globalForAuthDb.authDb) {
    const databaseFile = process.env.AUTH_SQLITE_PATH ?? path.join(process.cwd(), "server", "auth.sqlite");
    
    // Ensure the server directory exists
    const serverDir = path.dirname(databaseFile);
    mkdir(serverDir, { recursive: true }).catch(() => {
      // Ignore errors if directory already exists
    });
    
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

