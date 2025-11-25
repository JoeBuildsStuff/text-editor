# Sidebar root drop issue

When dragging a document above/below top-level folders in the sidebar, the drop handler expects both the dragged item and the hovered sibling to expose numeric `sortOrder` values. The API does not always return a `sortOrder` for folders, which means the handler never reaches the branch that reorders siblings. Drops then fall through to the "drop into folder" path, making it impossible to put a file back in the root when the root only contains folders.

## Options considered

1. **Normalize folder sort orders when building the tree.** Ensure every folder node has a numeric `sortOrder` (e.g., default to `0` when undefined) so the existing drag logic continues working.
2. **Relax the drag handler guard.** Allow the "reorder siblings" branch to run even if the hovered item currently lacks a `sortOrder`, since the handler immediately reassigns orders anyway.

## Quick fix applied

Implemented option 1 in `src/components/sidebar/tree/tree-utils.ts` by defaulting folder nodes to `0` when the API does not provide a `sortOrder`. This guarantees that top-level folders expose numeric sort orders, allowing documents to be dropped back into the root instead of being forced into another folder.
