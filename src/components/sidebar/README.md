# Sidebar module

This folder encapsulates the interactive markdown explorer that powers the left-hand sidebar in the app. The sidebar lets users browse, create, rename, delete, and reorder markdown documents/folders while keeping the server state in sync.

## High-level flow

1. `AppSidebar` wires UI primitives from `@/components/ui/sidebar` with the sidebar-specific logic that comes from the `useMarkdownExplorer` hook. It renders the action buttons, the tree view, and the `RenameDialog`.
2. `useMarkdownExplorer` is the only place that manages sidebar state: it performs queries/mutations, derives the tree structure, tracks which folders are open, controls drag-and-drop, and exposes handler props for the presentation layer.
3. `SidebarTree` renders the tree UI. It is a pure component that receives everything it needs as props and focuses on rendering, keyboard interactions, and DnD affordances.
4. `tree-utils.ts` and `tree-types.ts` define the serializable tree structure plus helpers for building routes (`buildDocumentsPath`) and normalizing/sorting documents and folders.
5. `api/markdown-actions.ts` is the thin client around `/api/markdown` with typed helpers for fetching the index or mutating (create/delete/move/rename/update sort order).

## Key files

| File | Responsibility |
| --- | --- |
| `app-sidebar.tsx` | Container component that renders the sidebar chrome, action buttons, tree, footer, and rename dialog. It receives the entire explorer state from the hook. |
| `app-sidebar-logo.tsx` | Simple header block that renders the app brand icon/text using the shared sidebar UI primitives. |
| `hooks/use-markdown-explorer.ts` | Core hook that combines React Query, router interactions, drag-and-drop logic, optimistic updates, rename dialog state, and helpers for CRUD actions. |
| `tree/sidebar-tree.tsx` | Presentation-only tree view built on `@dnd-kit` and the sidebar UI toolkit. |
| `tree/tree-utils.ts` | Builds a nested `SidebarTreeElement[]` out of flat documents/folders and provides deterministic sorting + `/documents/:slug` path helpers. |
| `api/markdown-actions.ts` | Fetch/ mutate helpers that talk to `/api/markdown` using JSON payloads and throw typed errors for the hook to surface. |
| `rename-dialog.tsx` | Generic dialog that `useMarkdownExplorer` controls to rename either folders or documents. |

## `useMarkdownExplorer` responsibilities

The hook is designed as a single source of truth for sidebar behavior:

- **Data fetching** – Uses `useQuery` from TanStack Query with key `['markdown-index']` (`MARKDOWN_INDEX_QUERY_KEY`) to load the document/folder index, keep it cached for 30s, and expose loading/error flags.
- **Derived data** – Memoizes the active documents/folders arrays, builds the tree via `buildDocumentsTree`, and decodes the current slug from the URL (`/documents/...`).
- **Navigation helpers** – `navigateToSlug` pushes the derived document slug through Next.js router while `buildDocumentsPath` centralizes encoding.
- **Folder state** – Tracks which folders are open, auto-opens folder paths for the currently selected document, and exposes `toggleFolder`, `openFolderPath`, and `closeFolderPath` helpers.
- **Creation helpers** – `createDocumentInPath` and `createFolderInPath` call the API helpers, optimistically expand parent folders, refresh the query silently, and toast the outcome. Exposed to the UI via `createDocument`/`createFolder`.
- **Deletion helpers** – `deleteDocumentById` and `deleteFolderAtPath` optimistically update the cached index, reset the active route if needed, and roll back on failure.
- **Drag & drop** – Sets up DnD sensors, collision detection, and exposes `onDragStart/onDragEnd/onDragCancel`. It also includes logic to reassign sort orders and call `moveMarkdownDocument` or `updateMarkdownSortOrder` as items rearrange.
- **Rename dialog state** – Tracks whether the dialog is open, what entity is being renamed, the proposed name, and supplies handlers to `RenameDialog`. Submissions hit either `renameMarkdownDocument` or `renameMarkdownFolder` then refetch the index.

All of the above is exposed as the `treeProps`, `createDocument`, `createFolder`, and `renameDialogProps` consumed by `AppSidebar`.

## Tree rendering & drag-and-drop

`SidebarTree` couples the explorer data with the shared sidebar menu primitives:

- Wraps the tree with `DndContext`, `SortableContext`, and drop targets defined per folder/document (plus a root droppable) so that the hook can respond to drag callbacks.
- Each folder/document node wires the drag listeners and displays visual cues (drop indicators, muted overlays) and a context menu with create/rename/delete affordances. The component never mutates data directly—it raises events (e.g. `onDeleteDocument`) back to the hook.
- Nested children render recursively inside `Collapsible` wrappers, which are controlled via the `openFolders` Set that is passed in from the hook.
- The drag overlay for the active document label is rendered via the `activeDragLabel` string maintained in the hook.

## API contract

All CRUD operations ultimately go through `/api/markdown` and the helpers defined in `api/markdown-actions.ts`:

- `fetchMarkdownIndex` (GET) – returns `{ documents: MarkdownDocument[], folders: MarkdownFolder[] }` after validating the payload.
- `createMarkdownDocument` / `createMarkdownFolder` (POST) – create new entries under an optional folder path.
- `deleteMarkdownDocument` / `deleteMarkdownFolder` (DELETE) – remove entities; folder deletes cascade to nested items.
- `updateMarkdownSortOrder`, `moveMarkdownDocument`, `renameMarkdownFolder`, `renameMarkdownDocument` (PATCH) – update ordering, location, or labels. Errors from the endpoint bubble up so the hook can toast them.

Because the hook always mutates the React Query cache first, the UI remains responsive even before the server confirms the mutation. After each mutation the hook either invalidates (`loadDocuments({ silent: true })`) or explicitly refetches the index to stay consistent.

## Adding new functionality

- **New bulk actions** – Extend the hook with another helper that calls a new API function, update `treeProps` with the callback, and add UI affordances in `SidebarTree` or `AppSidebar`.
- **Extra metadata in tree** – Augment `SidebarTreeElement` in `tree-types.ts`, make sure `buildDocumentsTree` populates it, and thread the data through the hook so the tree can display it.
- **Different storage backend** – Update `/api/markdown` implementation, but keep the same API surface so the client helpers continue to work untouched.
- **Testing** – Since all core logic lives in `useMarkdownExplorer`, you can unit-test most behaviors by mocking the API helpers and TanStack Query layer.

Keeping the data flow centralized in the hook and feeding serializable props into the tree makes it easy to reason about the sidebar and introduce new behaviors without scattering state across multiple components.
