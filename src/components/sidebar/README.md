# Sidebar module

This folder encapsulates the interactive markdown explorer that powers the left-hand sidebar in the app. The sidebar lets users browse, create, rename, delete, and reorder markdown documents/folders while keeping the server state in sync.

## High-level flow

1. `AppSidebar` wires UI primitives from `@/components/ui/sidebar` with the sidebar-specific logic that comes from the `useMarkdownExplorer` hook. It renders the action buttons, the tree view, loading/error states, Terminal link, and the `RenameDialog`.
2. `useMarkdownExplorer` is the only place that manages sidebar state: it performs queries/mutations, derives the tree structure, tracks which folders are open, controls drag-and-drop with optimistic updates, manages rename dialog state, and exposes handler props for the presentation layer.
3. `SidebarTree` renders the tree UI. It is a pure component that receives everything it needs as props and focuses on rendering, keyboard interactions, context menus, visual drag feedback, and DnD affordances.
4. `tree-utils.ts` and `tree-types.ts` define the serializable tree structure plus helpers for building routes (`buildDocumentsPath`) and normalizing/sorting documents and folders with deterministic ordering.
5. `api/markdown-actions.ts` is the thin client around `/api/markdown` with typed helpers for fetching the index or mutating (create/delete/move/rename/update sort order), including error handling and response validation.

## Key files

| File | Responsibility |
| --- | --- |
| `app-sidebar.tsx` | Container component that renders the sidebar chrome, action buttons (New Document, Terminal link), tree, loading/error states, footer with UserMenu, and rename dialog. It receives the entire explorer state from the hook. |
| `app-sidebar-logo.tsx` | Simple header block that renders the app brand icon/text ("Text Editor" by "Joe Builds Stuff") using the shared sidebar UI primitives. |
| `hooks/use-markdown-explorer.ts` | Core hook that combines React Query, router interactions, drag-and-drop logic with collision detection, optimistic updates with rollback, rename dialog state, toast notifications, auto-folder opening, and helpers for CRUD actions. |
| `tree/sidebar-tree.tsx` | Presentation-only tree view built on `@dnd-kit` and the sidebar UI toolkit. Handles context menus, drag overlays, drop position indicators, and visual feedback during drag operations. |
| `tree/tree-utils.ts` | Builds a nested `SidebarTreeElement[]` out of flat documents/folders and provides deterministic sorting (sortOrder first, then alphabetical) + `/documents/:slug` path helpers. Recursively sorts nested children. |
| `api/markdown-actions.ts` | Fetch/mutate helpers that talk to `/api/markdown` using JSON payloads, include AbortSignal support, validate responses with type guards, extract error messages, and throw typed errors for the hook to surface. |
| `rename-dialog.tsx` | Generic dialog that `useMarkdownExplorer` controls to rename either folders or documents. Supports keyboard shortcuts (Enter to submit, Escape to cancel) and validates input. |

## `useMarkdownExplorer` responsibilities

The hook is designed as a single source of truth for sidebar behavior:

- **Data fetching** – Uses `useQuery` from TanStack Query with key `['markdown-index']` (`MARKDOWN_INDEX_QUERY_KEY`) to load the document/folder index, keep it cached for 30s (`staleTime: 30_000`), disable refetch on window focus, and expose loading/error flags. Supports silent refetching via `loadDocuments({ silent: true })` to update cache without user-visible loading states.
- **Derived data** – Memoizes the active documents/folders arrays, builds the tree via `buildDocumentsTree`, and decodes the current slug from the URL (`/documents/...`). The `selectedSlug` is derived from the pathname by splitting on `/documents/` and decoding URI components.
- **Navigation helpers** – `navigateToSlug` pushes the derived document slug through Next.js router while `buildDocumentsPath` centralizes encoding. After renaming documents, the URL is automatically updated to reflect the new slug.
- **Folder state** – Tracks which folders are open in a `Set<string>`, auto-opens folder paths for the currently selected document via `autoOpenFolders` memo, and merges manual opens with auto-opens in `derivedOpenFolders`. Exposes `toggleFolder`, `openFolderPath`, and `closeFolderPath` helpers. When creating items, parent folders are automatically opened.
- **Action state** – Uses `useTransition` to track `isActionPending` state, preventing concurrent operations and disabling UI controls during mutations.
- **Creation helpers** – `createDocumentInPath` and `createFolderInPath` call the API helpers, optimistically expand parent folders, refresh the query silently, navigate to the new document (for documents), and toast success messages. Documents are created with default title "untititled", folders with "untitled-folder". Exposed to the UI via `createDocument`/`createFolder` wrappers that handle errors with toast notifications.
- **Deletion helpers** – `deleteDocumentById` and `deleteFolderAtPath` optimistically update the cached index (removing items immediately), reset the active route if the deleted item was selected, and roll back on failure by restoring the removed items to their original positions. Folder deletion cascades to nested items (both folders and documents) with proper cleanup.
- **Drag & drop** – Sets up DnD with `PointerSensor` (6px activation distance to prevent accidental drags), custom collision detection that prefers non-root collisions, and exposes `onDragStart/onDragEnd/onDragCancel`. Tracks `activeDragLabel` for the drag overlay. The `handleDragEnd` logic:
  - Detects drop zones: middle zone (25-75% height) for folders, top/bottom zones for documents
  - Handles same-sibling reordering by updating sort orders
  - Handles cross-sibling moves by updating source and target sort orders
  - Handles folder drops by moving documents into folders
  - Uses `assignSortOrders` to calculate new sort orders (1000-based increments) and batch-updates them
  - Automatically opens target folders after moves
- **Sort order management** – `assignSortOrders` calculates sort orders as `(index + 1) * 1000` to allow insertion between items. Only updates items whose sort order actually changed, batches updates with `Promise.allSettled`, and can skip specific IDs (useful during drag operations).
- **Rename dialog state** – Tracks whether the dialog is open, what entity is being renamed (`renameType`: "document" | "folder"), the entity ID/path, current name, and proposed name. Submissions validate the new name (non-empty, different from current), hit either `renameMarkdownDocument` or `renameMarkdownFolder`, refetch the index silently, update the URL if renaming a document, and toast success/error messages.
- **Error handling** – All mutations are wrapped in try-catch blocks that restore optimistic updates on failure, show error toasts, and preserve navigation state when possible.

All of the above is exposed as the `treeProps`, `createDocument`, `createFolder`, `renameDialogProps`, `isLoadingFiles`, `filesError`, `isActionPending`, and `hasTreeData` consumed by `AppSidebar`.

## Tree rendering & drag-and-drop

`SidebarTree` couples the explorer data with the shared sidebar menu primitives:

- Wraps the tree with `DndContext`, `SortableContext` (using `verticalListSortingStrategy`), and drop targets defined per folder/document (plus a root droppable via `RootDropZone`) so that the hook can respond to drag callbacks.
- Each folder/document node wires the drag listeners via `useSortable` and displays visual cues during drag:
  - **Drop position indicators** (`DropGapIndicator`): Shows where items will be inserted (top/bottom for documents, top/bottom/middle for folders)
  - **Drop zone highlighting**: Folders show `bg-muted/40` when items are dragged into the middle zone
  - **Opacity changes**: Dragged items become fully transparent (`opacity-0`) and collapse (`h-0`) to make room for drop indicators
  - **Drag overlay**: Custom overlay shows the active drag label with file icon, animated to the drop target position
- **Context menus**: Both folders and documents have right-click context menus:
  - **Folders**: Add Document, Add Folder, Rename Folder (if not root), Delete Folder (if not root)
  - **Documents**: Rename Document, Delete Document
  - Menus are disabled when `isActionPending` is true
- The component never mutates data directly—it raises events (e.g. `onDeleteDocument`, `onRenameFolder`) back to the hook.
- Nested children render recursively inside `Collapsible` wrappers, which are controlled via the `openFolders` Set that is passed in from the hook. The `isNested` prop is threaded through to adjust styling for nested items.
- **Drop animation**: Custom `dropAnimation` function animates the drag overlay to the final drop position over 220ms with ease-out easing, providing visual feedback of where items land.
- **Root drop zone**: The entire tree is wrapped in a `RootDropZone` that accepts drops at the root level, showing a muted background when items are dragged over it.
- **Selection highlighting**: Selected documents show `bg-muted/50` with `font-semibold` to indicate the active document.
- **Folder icons**: Folders show `FolderOpenIcon` when open, `FolderIcon` when closed, with a rotating chevron indicator.

## API contract

All CRUD operations ultimately go through `/api/markdown` and the helpers defined in `api/markdown-actions.ts`:

- `fetchMarkdownIndex` (GET) – Returns `{ documents: MarkdownDocument[], folders: MarkdownFolder[] }` after validating the payload with type guards. Supports `AbortSignal` for request cancellation. Handles both `documents` and legacy `files` response keys for backward compatibility. Validates that documents have required fields (`id`, `slug`, `documentPath`, `title`) and folders have required fields (`id`, `folderPath`, `createdAt`, `updatedAt`).
- `createMarkdownDocument` / `createMarkdownFolder` (POST) – Create new entries under an optional folder path. Documents accept `{ title?: string, folderPath?: string }`, folders accept a `folderPath` string. Returns the created entity or `null` on failure.
- `deleteMarkdownDocument` / `deleteMarkdownFolder` (DELETE) – Remove entities; folder deletes cascade to nested items on the server. Documents are deleted by `id`, folders by `folderPath`.
- `updateMarkdownSortOrder`, `moveMarkdownDocument`, `renameMarkdownFolder`, `renameMarkdownDocument` (PATCH) – Update ordering, location, or labels. `updateMarkdownSortOrder` accepts `{ id, type: "document" | "folder", sortOrder }`. `moveMarkdownDocument` accepts `{ id, targetFolderPath?, sortOrder? }` and returns the updated document. `renameMarkdownFolder` accepts `{ type: "folder", folderPath, newName }`. `renameMarkdownDocument` accepts `{ id, title }` and returns the updated document with potentially new slug.
- **Error handling**: All API helpers use a shared `markdownRequest` function that:
  - Extracts error messages from response JSON when available
  - Falls back to provided `errorMessage` if parsing fails
  - Throws `Error` instances that the hook can catch and display
  - Supports `AbortSignal` for request cancellation
  - Validates response structure and types

Because the hook always mutates the React Query cache first (optimistic updates), the UI remains responsive even before the server confirms the mutation. After each mutation the hook either invalidates (`loadDocuments({ silent: true })`) or explicitly refetches the index to stay consistent. Failed mutations trigger rollback of optimistic updates.

## Tree utilities & sorting

The `tree-utils.ts` file provides core tree-building and sorting logic:

- **`buildDocumentsTree`** – Constructs a nested tree structure from flat arrays of documents and folders:
  - Creates a root node with `DOCUMENTS_ROOT_ID`
  - Recursively builds folder nodes by splitting `folderPath` into segments
  - Attaches documents to their parent folders based on `documentPath`
  - Uses document `title` if available, otherwise strips `.md` extension from filename
  - Assigns `sortOrder` from database records to tree elements
- **`sortTree`** – Recursively sorts tree elements:
  - Primary sort: `sortOrder` (if both are numbers)
  - Secondary sort: alphabetical by `name` using `localeCompare`
  - Applies sorting to all nested children recursively
- **`buildDocumentsPath`** – Encodes a slug into a `/documents/...` URL path by URI-encoding each path segment

## AppSidebar UI details

The `AppSidebar` component includes several UI elements not detailed in the hook:

- **Header actions**: "New Document" button and "Terminal" link in the top menu group
- **Documents section header**: Shows "Documents" label with inline action buttons (Add Document, Add Folder icons)
- **Loading state**: Displays a `Spinner` with "Loading files…" message when `isLoadingFiles` is true
- **Error state**: Shows error message in red text when `filesError` is present
- **Empty state**: Renders nothing if `!hasTreeData` (tree only renders when there are elements)
- **Footer**: Contains `UserMenu` component for user account actions
- **Action button states**: All action buttons are disabled when `isActionPending` is true

## Adding new functionality

- **New bulk actions** – Extend the hook with another helper that calls a new API function, update `treeProps` with the callback, and add UI affordances in `SidebarTree` or `AppSidebar`. Remember to handle optimistic updates and error rollback.
- **Extra metadata in tree** – Augment `SidebarTreeElement` in `tree-types.ts`, make sure `buildDocumentsTree` populates it, and thread the data through the hook so the tree can display it. Update the API response types in `markdown-actions.ts` if needed.
- **Different storage backend** – Update `/api/markdown` implementation, but keep the same API surface so the client helpers continue to work untouched. Ensure response shapes match the expected types.
- **Enhanced drag feedback** – The commented-out `SourceGhostOverlay` code shows how to add a ghost element at the source position during drag. Uncomment and wire it up if desired.
- **Keyboard shortcuts** – Add keyboard handlers to `SidebarTree` for common actions (e.g., Delete key to delete selected item, F2 to rename).
- **Testing** – Since all core logic lives in `useMarkdownExplorer`, you can unit-test most behaviors by mocking the API helpers and TanStack Query layer. Test optimistic updates, rollback scenarios, and drag-and-drop logic separately.

Keeping the data flow centralized in the hook and feeding serializable props into the tree makes it easy to reason about the sidebar and introduce new behaviors without scattering state across multiple components.
