# Sidebar Root Drop Issue - Refactoring Plan

## Problem Summary

When dragging a document above/below top-level folders in the sidebar, the drop handler fails to reorder siblings when folders lack a `sortOrder` value from the API. The handler requires both the dragged item and the hovered sibling to have numeric `sortOrder` values before attempting reordering. When this check fails, drops fall through to the "drop into folder" path, making it impossible to place files back in the root when the root only contains folders without sort orders.

## Root Cause Analysis

### Current Flow

1. **API Response** (`src/lib/markdown-files.ts:277`):
   - Folders are returned with `sortOrder: row.sort_order` directly from the database
   - If the database `sort_order` column is `NULL`, this becomes `undefined` or `null`
   - Documents default to `sortOrder: row.sort_order ?? 0` (line 204), but folders do not

2. **Type Definition** (`src/components/sidebar/tree/tree-types.ts:19`):
   - `MarkdownFolder.sortOrder?: number` - optional field
   - `MarkdownDocument.sortOrder?: number` - optional field

3. **Tree Building** (`src/components/sidebar/tree/tree-utils.ts:90`):
   - **Quick fix applied**: Folders default to `sortOrder: 0` when API doesn't provide one
   - This ensures folders always have a numeric `sortOrder` in the tree structure

4. **Drag Handler** (`src/components/sidebar/hooks/use-markdown-explorer.ts:696`):
   - **Strict check**: `if (typeof activeData.sortOrder === "number" && typeof overData.sortOrder === "number")`
   - This guard prevents the "reorder siblings" branch from executing when either item lacks a numeric sort order
   - Because older folder rows can still have `NULL sort_order`, the guard frequently bails out unless we normalize the data before it reaches the handler

### Why the Quick Fix Works But Isn't Ideal

The quick fix (defaulting folders to `sortOrder: 0` in `tree-utils.ts`) works because:
- It guarantees folders rendered in the tree expose numeric sort orders, letting the drag handler proceed
- Users can once again drop documents into the root even when it only contains folders

However, this approach has limitations:
- **UI hides the data problem**: We are compensating in the tree builder for stale data (`NULL sort_order` values) that should be normalized closer to the source
- **Existing rows stay inconsistent**: We still have folders in the database/API payload without real sort orders, so any other consumer would hit the same issue
- **Long-term drift**: Without backfilling and enforcing non-null sort orders, future features that rely on deterministic ordering may behave unpredictably

## Refactoring Strategy

### Option 1: Normalize at the Data Source (Recommended)

**Approach**: Guarantee that every folder coming from persistence exposes a numeric `sortOrder`, mirroring the document handling path.

**Changes Required**:

1. **Backfill database nulls**:
   - Run an update similar to `UPDATE folders SET sort_order = 0 WHERE sort_order IS NULL;`
   - Optionally set the column to `NOT NULL DEFAULT 0` going forward (new migration)

2. **Normalize in `listMarkdownItems` (`src/lib/markdown-files.ts`)**:
   - Map folders as `sortOrder: row.sort_order ?? 0` just like documents already do in `documentRecordToMeta`

3. **Keep the UI fallback for safety**:
   - Leave the `tree-utils.ts` default in place until we are confident all rows are normalized, then remove it in a later cleanup

**Pros**:
- Fixes the actual bad data that triggered the bug
- Keeps drag-and-drop logic unchanged (no risky behavioral tweaks)
- Any future consumer of the API benefits from deterministic ordering

**Cons**:
- Requires a data migration plus coordination if there are multiple environments
- Need to verify there are no callers relying on `NULL` sort orders

### Option 2: Relax Drag Handler Guard

**Approach**: Make the drag handler more tolerant so reordering works even if some nodes still lack a numeric sort order.

**Changes Required**:

1. **Update `handleDragEnd` in `use-markdown-explorer.ts`**:
   - Replace the strict `typeof ... === "number"` guard with logic that checks sibling relationships first
   - Fall back to treating missing sort orders as `0` when computing placements

2. **Normalize drag payloads in `sidebar-tree.tsx`**:
   - When building the sortable data, default `sortOrder` to `0` so the handler never sees `undefined`

**Pros**:
- Works even if some folders still have `NULL sort_order`
- Requires no migration or backend coordination

**Cons**:
- Still leaves inconsistent data coming from the API
- More moving parts in the drag handler, which is already complex

### Option 3: Belt-and-Suspenders (Long-term Hardening)

**Approach**: Normalize at the data source (Option 1) **and** keep the drag handler defensive (Option 2).

**Changes Required**:

1. **Run the normalization steps from Option 1**
2. **Apply the defensive guard changes from Option 2**
3. **Remove the temporary `tree-utils.ts` fallback once telemetry confirms the API never sends undefined sort orders**

**Pros**:
- Ensures the bug stays fixed even if future regressions reintroduce `NULL` sort orders
- Keeps the UI resilient to unexpected payloads

**Cons**:
- Touches the most surface area, so it carries the largest testing burden

## Recommended Implementation Plan

### Phase 1: Normalize Folder Sort Orders (High Priority)

**Files**: Database migration scripts, `src/lib/markdown-files.ts`

**Changes**:

1. Add a migration that backfills `NULL` folder sort orders to `0` and enforces `DEFAULT 0 NOT NULL`
2. Update `listMarkdownItems` to map `sortOrder: row.sort_order ?? 0` for folders
3. Keep telemetry/metrics to confirm every folder coming from the API now has a numeric `sortOrder`

**Testing**:
- Run the API locally and inspect the `/api/markdown` payload to confirm every folder reports a number
- Create new folders/documents and ensure the new rows inherit the default

### Phase 2: Cleanup UI Fallback (Medium Priority)

**File**: `src/components/sidebar/tree/tree-utils.ts`

**Changes**:

1. Once Phase 1 has been validated, remove the fallback default (`typeof folder.sortOrder === "number" ? folder.sortOrder : 0`)
2. Add a development-time assertion or type guard to surface any future undefined sort orders early

**Testing**:
- Rebuild the tree and verify there are no runtime warnings/assertions
- Repeat the drag-and-drop scenarios at the root level

### Phase 3: Optional Drag Handler Hardening (Low Priority)

**Files**: `src/components/sidebar/hooks/use-markdown-explorer.ts`, `src/components/sidebar/tree/sidebar-tree.tsx`

**Changes**:

1. Loosen the `handleDragEnd` guard so it can tolerate undefined sort orders (defensive coding)
2. When constructing drag payloads, default `sortOrder` to `0` to guarantee numeric values at runtime

**Testing**:
- Exercise the entire drag-and-drop test checklist to ensure no regressions

## Implementation Details

### Key Functions to Modify

1. **`listMarkdownItems` in `markdown-files.ts`**:
   - Folder mapping should coerce `row.sort_order ?? 0`

2. **`buildDocumentsTree` in `tree-utils.ts`**:
   - Currently adds a defensive fallback; this can be removed once data is normalized

3. **`handleDragEnd` in `use-markdown-explorer.ts`**:
   - Optional guard relaxation and extra defensive coding live here

4. **Drag payloads in `sidebar-tree.tsx`**:
   - If we keep the defensive approach, set `sortOrder: element.sortOrder ?? 0`

### Edge Cases to Handle

1. **Root-level drops with only folders**: Should work after fix
2. **Mixed scenarios**: Some items with sort orders, some without
3. **Database NULL values**: API should normalize to `0`
4. **Newly created items**: May not have sort orders initially
5. **Legacy data**: Old folders/documents without sort orders

### Testing Checklist

- [ ] Drag document above folder without sort order (root level)
- [ ] Drag document below folder without sort order (root level)
- [ ] Drag folder above document without sort order (root level)
- [ ] Drag folder below document without sort order (root level)
- [ ] Drag items when both have sort orders (existing functionality)
- [ ] Drag items when neither has sort order
- [ ] Drop document into folder (should still work)
- [ ] Reorder siblings within same folder
- [ ] Move document between folders
- [ ] Verify sort orders are assigned correctly after drag
- [ ] Test with root containing only folders
- [ ] Test with root containing only documents
- [ ] Test with root containing mixed items

## Migration Notes

- Phase 1 explicitly requires a migration (or manual SQL script) to backfill `folders.sort_order` and enforce the default
- The quick fix in `tree-utils.ts` can remain temporarily during Phase 1 implementation
- Phase 2 (removing the fallback) should only happen after the migration has been applied and verified everywhere
- Phase 3 is optional hardening once the data layer is guaranteed to be clean

## Success Criteria

1. ✅ Documents can be dropped above/below folders at root level, even when folders lack sort orders
2. ✅ Drag handler logic is more resilient to missing data
3. ✅ API consistently returns sort orders for all items
4. ✅ No regression in existing drag-and-drop functionality
5. ✅ Code is cleaner with better separation of concerns

## Timeline Estimate

- **Phase 1**: 2-3 hours (data migration + API normalization)
- **Phase 2**: 30-45 minutes (remove UI fallback, add assertions)
- **Phase 3**: 1 hour (optional drag handler hardening)
- **Testing**: 1-2 hours (comprehensive drag-and-drop regression pass)

**Total**: ~4-6 hours
