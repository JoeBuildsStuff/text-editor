# Server Database & Migration Best Practices

This project keeps all persistent data under the `server/` directory. The `documents` feature stores metadata in `documents.db` (SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)) and saves markdown files in `server/documents/`. Authentication tables live in `auth.sqlite` and are owned by Better Auth.

The repo intentionally does **not** commit the SQLite files, so every contributor must be able to recreate their databases from source-controlled SQL. Follow the guidelines below whenever you change database structure or need to maintain migrations.

## Directory Anatomy

- `server/documents.db` – user documents & folders metadata (created by `pnpm db:setup`)
- `server/auth.sqlite` – Better Auth tables (populated by `pnpm auth:migrate`)
- `server/documents/` – markdown files for document content
- `server/uploads/` – binary uploads (images, attachments) written by `/api/files/*`
- `sql/documents-schema.sql` – authoritative schema for new `documents.db` instances
- `sql/documents-seed.sql` – optional seed data applied only when the DB is empty
- `sql/migrations/` – place to store incremental schema migrations (create this directory if it does not exist yet)

## General Workflow

1. **Plan the change** – capture the schema delta (new table, column, constraint, or index). When possible, prefer additive changes so that migrations remain simple and low-risk.
2. **Write a migration** – create a timestamped file such as `sql/migrations/20240607_add-folder-flags.sql`. Wrap destructive work in `BEGIN TRANSACTION / COMMIT` and add guard clauses (e.g., `PRAGMA foreign_keys = ON;` or `SELECT` checks) so the migration can safely run once.
3. **Update the canonical schema** – mirror the change in `sql/documents-schema.sql` so new environments start with the updated layout. Keep the schema file nicely formatted and ensure indices/constraints match the migration.
4. **Adjust seed data** – if the schema change requires new columns or tables, update `sql/documents-seed.sql` so fresh databases include valid sample records.
5. **Apply locally** – run the migration against your local DB (`sqlite3 server/documents.db < sql/migrations/<file>.sql`) or temporarily drop/recreate the file via `pnpm db:setup`. Always back up your local DB before destructive changes (`cp server/documents.db server/documents.db.bak`).
6. **Verify** – execute `pnpm db:setup` to confirm that the schema file is still valid, run your automated tests, and boot the dev server to sanity check the UI.
7. **Commit artifacts** – include the migration SQL, schema update, and any code changes in the same pull request. Never commit the `.db` binaries.

## Modifying Tables Safely

- **Use `ALTER TABLE` sparingly** – SQLite has limited `ALTER TABLE` support. Complex changes often require creating a new table, copying data, and swapping names. Encapsulate the whole sequence in a transaction and double-check indexes.
- **Preserve data** – include `INSERT INTO ... SELECT ...` statements that migrate existing rows. Use defensive `WHERE` clauses for nullable data or defaults.
- **Backfill columns** – when adding a NOT NULL column, populate it in the same migration before adding constraints.
- **Add indexes explicitly** – put every index creation in both the migration file and the canonical schema.

## Maintaining the Migration Set

- Keep migrations **append-only**. Never edit historical migration files; add a new one when requirements change.
- **Document prerequisites** in SQL comments (`-- Requires documents >= 2024-06-01 schema`) so teammates know the baseline.
- When a migration includes manual steps (e.g., moving markdown files), spell them out in the PR description and link to the migration file.
- Periodically review whether a snapshot refresh is warranted. If migrations become long-lived and cumbersome, regenerate `documents-schema.sql` from the latest DB, archive the old migration files, and reset developer DBs via `pnpm db:init`.

## Auth Database Notes

- `server/auth.sqlite` is managed entirely by Better Auth. Do **not** edit this file manually.
- When auth schema changes are needed, update `src/lib/auth.ts` and rerun `pnpm auth:migrate` so the CLI regenerates the tables.

## Local Commands Reference

- `pnpm db:init` – runs `pnpm db:setup` (documents DB/bootstrap + seed) and `pnpm auth:migrate` (Better Auth CLI)
- `pnpm db:setup` – executes `scripts/setup-databases.ts`, reapplying `sql/documents-schema.sql` and reseeding when empty
- `pnpm auth:migrate` – lets Better Auth manage `auth.sqlite`

Following these steps keeps SQLite changes reproducible, reviewable, and safe for teammates who need to recreate the databases from scratch.
