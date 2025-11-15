import Database from "better-sqlite3";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const SERVER_DIR = path.join(ROOT_DIR, "server");
const DOCUMENTS_DB_PATH = process.env.DOCUMENTS_SQLITE_PATH ?? path.join(SERVER_DIR, "documents.db");
const AUTH_DB_PATH = process.env.AUTH_SQLITE_PATH ?? path.join(SERVER_DIR, "auth.sqlite");
const MARKDOWN_DIR = path.join(SERVER_DIR, "documents");
const DOCUMENTS_SCHEMA_PATH = path.join(ROOT_DIR, "sql", "documents-schema.sql");
const DOCUMENTS_SEED_PATH = path.join(ROOT_DIR, "sql", "documents-seed.sql");

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureServerDirs() {
  await mkdir(SERVER_DIR, { recursive: true });
  await mkdir(MARKDOWN_DIR, { recursive: true });
}

async function setupDocumentsDatabase() {
  const [schema, seedSql] = await Promise.all([
    readFile(DOCUMENTS_SCHEMA_PATH, "utf8"),
    fileExists(DOCUMENTS_SEED_PATH).then(exists => (exists ? readFile(DOCUMENTS_SEED_PATH, "utf8") : null)),
  ]);

  const db = new Database(DOCUMENTS_DB_PATH);

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(schema);

    const documentCount = db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count?: number };
    const folderCount = db.prepare("SELECT COUNT(*) as count FROM folders").get() as { count?: number };

    const shouldSeed = (!!seedSql && (documentCount?.count ?? 0) === 0 && (folderCount?.count ?? 0) === 0);
    if (shouldSeed) {
      db.exec(seedSql);
    }

    return shouldSeed;
  } finally {
    db.close();
  }
}

async function createSeedMarkdownFile() {
  const samplePath = path.join(MARKDOWN_DIR, "demo-folder", "welcome-to-text-editor.md");
  const sampleContent = `# Welcome to the Markdown Editor\n\nThis is a demo document that gets created when the SQLite databases are empty.\n\n- Update the title from the sidebar to see live metadata updates.\n- Edit this file with the in-app editor or directly on disk.\n\nHappy writing!\n`;

  // Skip creation if the file already exists
  if (await fileExists(samplePath)) {
    return false;
  }

  await mkdir(path.dirname(samplePath), { recursive: true });
  await writeFile(samplePath, sampleContent, "utf8");
  return true;
}

async function touchAuthDatabase() {
  // Better Auth CLI will turn this into a real schema. We just make sure the directory exists.
  const exists = await fileExists(AUTH_DB_PATH);
  if (!exists) {
    const db = new Database(AUTH_DB_PATH);
    db.close();
    return true;
  }
  return false;
}

async function main() {
  await ensureServerDirs();
  const seededDocuments = await setupDocumentsDatabase();
  const createdMarkdownFile = seededDocuments ? await createSeedMarkdownFile() : false;
  const createdAuthDb = await touchAuthDatabase();

  console.log("\n✅ Documents database ready at", DOCUMENTS_DB_PATH);
  if (seededDocuments) {
    console.log("  • Seed data applied from", DOCUMENTS_SEED_PATH);
  } else {
    console.log("  • Existing data preserved");
  }

  if (createdMarkdownFile) {
    console.log("  • Created sample markdown file inside", MARKDOWN_DIR);
  }

  if (createdAuthDb) {
    console.log("✅ Auth database placeholder created at", AUTH_DB_PATH);
    console.log("   Run `pnpm auth:migrate` to let Better Auth create its schema.");
  }
}

main().catch(error => {
  console.error("Failed to set up databases:", error);
  process.exit(1);
});
