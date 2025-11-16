# Project Documentation Overview

This directory captures the storage and Tiptap-specific work that makes file uploads behave like first-class citizens inside the markdown editor. Use it as a quick reference for how uploads flow through the system and where to extend things next.

## Highlights

- **Local-first uploads** – every image or attachment is saved under `server/uploads/<userId>/...` via `src/lib/file-storage.ts` instead of relying on Supabase.
- **Dedicated API surface** – `/api/files/{upload,serve,raw,delete}` authenticate every request, validate ownership, and either stream or remove the requested file.
- **Editor integration** – the Tiptap config only stores file paths. Rendering components call the API routes when they need a temporary URL, keeping editor content small and backend-controlled.
- **Documentation trail** – findings and open questions about the editor live in `tiptap-file-upload-findings.md`, while this README summarizes the implemented state.

## Storage Layout

| Purpose | Location | Notes |
| --- | --- | --- |
| Markdown metadata | `server/documents.db` | Managed by Better SQLite via scripts.
| Markdown content | `server/documents/` | One `.md` file per document (still editable outside the app).
| Binary uploads | `server/uploads/<userId>/...` | Created on demand; user ID ensures natural namespacing.

The upload helper (`src/lib/file-storage.ts`) sanitizes folder segments, enforces per-user scopes, and infers file extensions where possible. Override the root by exporting `FILE_STORAGE_DIR` in env if you need a different disk location.

## API Routes

| Route | Method | Responsibility |
| --- | --- | --- |
| `/api/files/upload` | `POST` | Accepts multipart form data, validates size/type, and writes to disk.
| `/api/files/serve` | `GET` | Confirms ownership and returns a short-lived `/api/files/raw?path=...` URL plus metadata.
| `/api/files/raw` | `GET` | Streams the file bytes with the proper `Content-Type`; auth required, no direct disk access.
| `/api/files/delete` | `DELETE` | Removes a stored file once the editor deletes its node.

All four routes call `requireUserSession` to fetch the Better Auth session and reuse `FileStorageError` responses for consistent error codes.

## Editor Hooks

- `src/components/tiptap/file-storage-manager.ts` – single client entry point for upload/delete/serve helpers.
- `src/components/tiptap/file-handler.tsx` – intercepts paste/drop events and calls the upload helper.
- `src/components/tiptap/custom-image-view.tsx`, `file-node-view.tsx`, `file-document-preview.tsx` – fetch `/api/files/serve` on mount to hydrate the node with an access URL.

Deleting any Tiptap node with a local `src` automatically calls the delete API, so unused files do not linger.

## Nuances & Responsibilities

- Client vs Server validation:
  - The editor uses client-side limits from `src/lib/uploads/config.ts` for fast feedback; the server re-validates every request using the same limits. The server is authoritative.
- Path vs URL:
  - Editor content stores only relative file paths like `{userId}/notes/base-uuid8.ext`. Components resolve a scoped internal URL via `/api/files/serve`, which points to `/api/files/raw?path=...`. Raw URLs are not persisted.
- Naming & layout:
  - Files are written as `${baseName}-${uuid8}${ext}` under `{userId}/{pathPrefix}/...`. The default `pathPrefix` is `notes`; override per upload via the API/form-data argument.
- Security & scoping:
  - `src/lib/file-storage.ts` normalizes paths and enforces that the first segment matches the authenticated user’s ID, preventing traversal and cross-user access.
- MIME types & extensions:
  - Allowed types are centralized in `src/lib/uploads/config.ts`. The server maps common MIME types to extensions and infers an extension when the upload lacks one.
- Storage root:
  - Set `FILE_STORAGE_DIR` to relocate the on-disk root. Relative values are resolved from the project root.

## Additional Reading

- `server/README.md` – migration practices for the SQLite databases plus reminders about `server/uploads`.
- `README.md` – high-level overview of how metadata and content interact in the hybrid storage model.

Keeping these docs up to date will make it easier to revisit Supabase or another object store later if requirements change.
