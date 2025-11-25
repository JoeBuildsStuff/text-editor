# Sidebar DnD Hardening, Ordering, and Data Plan

This plan builds on the current refactor to simplify drag-and-drop (DnD), unify how IDs/zones are handled, reduce reorder writes, and normalize data. It’s organized in phases with deliverables, integrations, and acceptance criteria.

## Phase 1 — Centralize DnD ID Conventions

Deliverables
- Add `src/components/sidebar/tree/dnd-utils.ts` with:
  - `makeFolderDroppableId(folderId: string): string`
  - `isFolderDroppableId(id: string): boolean`
  - `parseFolderDroppableId(id: string): { folderId: string } | null`
  - `resolveSortableId(overId: string, overData: unknown, tree: SidebarTreeElement[]): string | null`

Integrations
- Replace hard-coded `folder:<id>` string handling in:
  - `src/components/sidebar/tree/sidebar-tree.tsx` (hover comparisons, indicator logic)
  - `src/components/sidebar/hooks/use-markdown-explorer.ts` (drag-end normalization)
- All future droppable/hover ID checks must use these helpers.

Acceptance
- No direct string literals for `folder:` remain (verify via search).
- Drag-end consistently resolves folder droppables to their sortable IDs.

## Phase 2 — Extract Shared Drop-Zone Math

Deliverables
- Add in `dnd-utils.ts`:
  - `getDropPosition(activeRect: DOMRect | null, overRect: DOMRect | null, opts?: { top: number; bottom: number }): "top" | "middle" | "bottom" | null`
  - Export thresholds as constants: `TOP_BOUND = 0.25`, `BOTTOM_BOUND = 0.75`.

Integrations
- Replace relativeY threshold logic in:
  - `src/components/sidebar/tree/sidebar-tree.tsx` (both folder and document nodes)
  - `src/components/sidebar/hooks/use-markdown-explorer.ts` (drop logic)

Acceptance
- All zones are determined by a single utility with shared thresholds.
- Adjusting thresholds changes behavior uniformly.

## Phase 3 — Virtual Collision Targets + Single Droppable Per Row

Approach
- Implement a custom `collisionDetection` that yields three virtual targets per row: `"<id>::top"`, `"<id>::middle"`, `"<id>::bottom"`.
- Remove the separate inner folder droppable; rely on virtual targets to distinguish reorder (top/bottom) vs drop-into (middle).

Steps
- Add `virtualZoneCollisionDetection(elements, zones)` using each row’s rect split vertically.
- Normalize virtual IDs in the drag-end handler to actions:
  - `::top` → reorder above over-id
  - `::bottom` → reorder below over-id
  - `::middle` → drop into folder (or no-op for documents)
- Update indicator rendering to read the virtual target suffixes, not droppable IDs.

Acceptance
- Only one droppable/sortable per row remains.
- Indicators and behavior are driven by virtual zone IDs.
- Cross-file mapping between droppable and sortable IDs is no longer needed.

## Phase 4 — Data Normalization (DB + API)

Deliverables
- Migration
  - `UPDATE folders SET sort_order = 0 WHERE sort_order IS NULL;`
  - `ALTER TABLE folders ALTER COLUMN sort_order SET DEFAULT 0;`
  - `ALTER TABLE folders ALTER COLUMN sort_order SET NOT NULL;`
- API
  - In `src/lib/markdown-files.ts` ensure folders use `sortOrder: row.sort_order ?? 0`.
- UI cleanup
  - Remove fallback-to-0 guards for `sortOrder` in the tree once validated.

Acceptance
- API always returns numeric `sortOrder` for docs/folders.
- No UI fallback paths remain; fewer branches and edge cases.

## Phase 5 — Minimal-Write Reordering (Neighbor-Based Keys)

Approach
- Compute a sort key between neighbors to update only the moved item most of the time. Use fractional numbers or lexo-like strings.

Steps
- Add `computeSortOrderBetween(prev?: number, next?: number): number` (or string variant) to a shared util.
- Update `assignSortOrders` to:
  - Determine the new position via neighbors
  - Only update the moved item’s `sortOrder`
  - Re-space only on rare exhaustion/collision
- Consider changing DB type to `NUMERIC` if fractional precision needed.

Acceptance
- Typical reorder = single-row update.
- Mass rewrites removed except during occasional re-spacing.

## Phase 6 — Atomic Move + Index API

Deliverables
- Endpoint: `POST /markdown/move` (example)
  - Input: `{ id, type, targetFolderPath, beforeId?, afterId?, newSortOrder? }`
  - Behavior: transactional parent change + sort order set in one operation.
- Client
  - Replace two-step source/target updates with a single call producing the final `nextSortOrder`.

Acceptance
- One server round-trip per move.
- No intermediate inconsistent states.

## Phase 7 — Rollout and QA

- Feature-gate collision changes and single-droppable mode.
- Unit tests
  - DnD ID utils: making/parsing/normalizing
  - `getDropPosition` at boundary values
  - Neighbor-based `computeSortOrderBetween`
- E2E tests
  - Reorder above/below docs/folders at root and nested
  - Drop into folder (middle zone) with auto-expand delay
  - Cross-folder move ordering correctness
- Telemetry
  - Track moves, failures, re-spacing frequency

## Suggested File/Code Map
- `src/components/sidebar/tree/dnd-utils.ts`
  - ID helpers, zone math, virtual target helpers, thresholds
- Update sites
  - `src/components/sidebar/tree/sidebar-tree.tsx`
  - `src/components/sidebar/hooks/use-markdown-explorer.ts`
  - `src/lib/markdown-files.ts`
  - Migration SQL under `sql/migrations/*`

## Timeline (Rough)
- Phase 1–2: 2–3 hours (shared utils + refactors)
- Phase 3: 3–5 hours (virtual collision + single droppable)
- Phase 4: 2–3 hours (migration + API cleanup)
- Phase 5: 3–5 hours (minimal-write keys + UI changes)
- Phase 6: 2–4 hours (endpoint + client integration)
- QA: 2–4 hours (unit + e2e)

## Success Criteria
- Clean DnD API: one droppable per row, virtual targets for zones.
- No string-literal ID parsing scattered across files.
- Shared math for drop zones, single source of truth for thresholds.
- Deterministic numeric sort orders from API; no UI fallbacks.
- Reorders typically update one row; atomic move + index end-to-end.
