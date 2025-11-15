# Tiptap File Upload Findings & Options

## Observations

- The editor config (`src/components/tiptap/tiptap.tsx`) registers `createFileHandlerConfig` and forces `Image` to `allowBase64: false`, so images are only inserted once an upload succeeds.
- `createFileHandlerConfig` (`src/components/tiptap/file-handler.tsx`) uploads every drop/paste through `uploadFile` and only inserts `image`/`fileNode` nodes when it receives a `filePath`; failures are silently logged, so users see images disappear.
- `supabase-file-manager.ts` (`src/components/tiptap/supabase-file-manager.ts`) sends requests to `/api/files/upload`, `/api/files/delete`, and `/api/files/serve`, but no such routes exist under `src/app/api`, so uploads and signed URL fetches always fail with 404.
- Custom views for images/files (`custom-image-view.tsx`, `file-node-view.tsx`) also rely on `/api/files/serve`, so even seeded content containing stored paths would render as broken blocks.

## Impact

- Users cannot persist pasted or dropped images/files even though the UI suggests support.
- Missing API routes mean background fetches spam 404 responses and console errors.
- Lack of UI feedback leaves users unaware that uploads failed.

## Options

1. **Implement the `/api/files/*` routes (recommended)**
   - Add authenticated Next.js API handlers under `src/app/api/files/{upload,serve,delete}/route.ts` that proxy to Supabase Storage (or another object store).
   - Ensure uploads stream to storage, persist the returned path in Tiptap, and generate signed URLs for the viewers.
   - Update env/config so the editor knows which bucket/path to use per user.

2. **Provide a graceful fallback when uploads fail**
   - Temporarily allow base64 images (`allowBase64: true`) or keep the file node in a pending state until upload finishes.
   - Surface toast/error UI when `uploadFile` rejects or the API returns non-200 so users know their action failed.

3. **Disable file uploads until backend support exists**
   - Gate `enableFileNodes`/`createFileHandlerConfig` behind a feature flag tied to working storage routes.
   - Update docs/UX to clarify that only text markdown is supported to avoid misleading behavior.

Choose Option 1 if file uploads are a core requirement; combine with Option 2 for better UX. Option 3 is only suitable if uploads are out of scope for the near term.
