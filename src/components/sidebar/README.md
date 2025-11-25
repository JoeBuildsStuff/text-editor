# Sidebar module

This folder encapsulates the interactive markdown explorer that powers the left-hand sidebar in the app. The sidebar lets users browse, create, rename, delete, and reorder markdown documents and folders while keeping the server state in sync.

## High-level Flow

1. `AppSidebar` wires UI primitives from `@/components/ui/sidebar` with the sidebar-specific logic from `useMarkdownExplorer`. It renders action buttons, the tree view, loading/error states, the Terminal link, and the `RenameDialog`.
2. `useMarkdownExplorer` is the single source of truth for sidebar state: it performs queries/mutations, derives the tree structure, tracks open folders, controls drag-and-drop with optimistic updates, manages the rename dialog, and exposes handler props for the presentation layer.
3. `SidebarTree` renders the tree UI. It is presentation-only and receives everything via props. It focuses on rendering, keyboard interactions, context menus, visual drag feedback, and DnD affordances including gap indicators.
4. `tree-utils.ts` and `tree-types.ts` define the serializable tree structure plus helpers for building routes (`buildDocumentsPath`) and normalizing/sorting documents and folders with deterministic ordering.
5. `api/markdown-actions.ts` is the thin client around `/api/markdown` with typed helpers for fetching the index or mutating (create/delete/move/rename/update sort order), including error handling and response validation.

## Key Files

| File | Responsibility |
| --- | --- |
| `app-sidebar.tsx` | Container component that renders the sidebar chrome, action buttons (New Document, Terminal link), tree, loading/error states, footer with UserMenu, and rename dialog. Receives the explorer state from the hook. |
| `app-sidebar-logo.tsx` | Simple header block that renders the app brand icon/text ("Text Editor" by "Joe Builds Stuff"). |
| `hooks/use-markdown-explorer.ts` | Core hook that combines React Query, Next.js router interactions, drag-and-drop logic with collision detection, optimistic updates with rollback, rename dialog state, toast notifications, auto-folder opening, and helpers for CRUD actions. |
| `tree/sidebar-tree.tsx` | Presentation-only tree view built on `@dnd-kit`. Handles context menus, drag overlays, drop position indicators, and visual gap indicators while dragging. |
| `tree/dnd-utils.ts` | Centralized DnD helpers: folder droppable ID helpers, shared drop-zone math with thresholds, and sortable-id resolution. Exposes `TOP_BOUND = 0.25` and `BOTTOM_BOUND = 0.75` for folder drop zones. |
| `tree/tree-utils.ts` | Builds a nested `SidebarTreeElement[]` out of flat documents/folders and provides deterministic sorting (sortOrder first, then alphabetical) + `/documents/:slug` path helpers. Recursively sorts nested children. |
| `api/markdown-actions.ts` | Fetch/mutate helpers that talk to `/api/markdown` using JSON payloads, include AbortSignal support, validate responses with type guards, extract error messages, and throw typed errors. |
| `rename-dialog.tsx` | Generic dialog that `useMarkdownExplorer` controls to rename either folders or documents. Supports Enter to submit and Escape to cancel, with simple validation. |

## `useMarkdownExplorer` Responsibilities

The hook centralizes sidebar behavior:

- Data fetching – Uses TanStack Query (`['markdown-index']`) with `staleTime: 30_000`, no refetch on focus, and exposes loading/error flags. `loadDocuments({ silent: true })` refreshes cache without visible loading states.
- Derived data – Memoizes `documents` and `folders`, builds the tree via `buildDocumentsTree`, and derives `selectedSlug` from the URL.
- Navigation – `navigateToSlug` pushes via Next.js router while `buildDocumentsPath` centralizes encoding/decoding. After rename, URLs update to match new slug.
- Folder state – Tracks open folder IDs in a `Set<string>`, auto-opens the path of the selected document (`autoOpenFolders`), and merges with manual opens. Provides `toggleFolder`, `openFolderPath`, and `closeFolderPath`.
- Action state – Uses `useTransition` to serialize actions and disable controls while pending.
- Create helpers – `createDocumentInPath` and `createFolderInPath` call the API, optimistically expand parents, silently refresh the index, navigate to the new document (for docs), and toast success.
- Delete helpers – Optimistically remove, with rollback on failure. Deleting a selected document clears selection, then restores it on error.
- Rename helpers – Opens a shared dialog for folders/documents and performs the mutations with optimistic navigation for documents.
- DnD glue – Provides sensors, collision detection that deprioritizes the root droppable, drag start/end/cancel handlers, and an `activeDragLabel` used by the overlay and gap indicators.
- Sort order – Uses `computeSortOrderBetween` to assign fractional sort orders when dropping between items and resequences sparingly as a fallback.

## Drag and Drop Behavior

- Zones and thresholds
  - Folders have three zones: `top`, `middle`, `bottom` determined by `getDropPosition` with `TOP_BOUND = 0.25` and `BOTTOM_BOUND = 0.75`.
  - Documents use a simple 50/50 split with no `middle` zone; only `top` or `bottom` is valid when hovering a document.
- Gap indicators
  - A dashed "gap" placeholder renders between items when hovering `top` or `bottom` of a target. It includes an icon (file/folder) and the `activeDragLabel`.
  - Hovering the `middle` of a folder highlights the folder row and shows an inner placeholder inside the folder content area to indicate "drop into this folder".
  - While dragging the current item, the source row collapses (`opacity-0 pointer-events-none h-0 overflow-hidden`) so indicators remain readable.
- Root drop zone
  - The root list is a droppable (`SIDEBAR_TREE_ROOT_DROPPABLE_ID`) that subtly highlights when hovered. Collision detection filters out root when any non-root candidates are present.
- Drop animation
  - `sidebar-tree.tsx` computes a target rect (`calculateDropTargetRect`) for the final position and animates the drag overlay to that rect using `defaultDropAnimationSideEffects` for a smooth snap.
- Sort order assignment
  - When dropping between siblings, the hook computes a new order via `computeSortOrderBetween(prev, next)` and updates only the moved item. Rarely, it resequences all siblings to coarse steps of 1000.

## Developer Notes

- Adjust folder hover sensitivity by changing `TOP_BOUND` and `BOTTOM_BOUND` in `tree/dnd-utils.ts`.
- `resolveSortableId` and `getDropPosition` are shared helpers to keep drop logic and visuals consistent between the tree component and the hook.
- If drag visuals or behavior drift, update both `use-markdown-explorer.ts` and `sidebar-tree.tsx` together—they intentionally share the same math.

