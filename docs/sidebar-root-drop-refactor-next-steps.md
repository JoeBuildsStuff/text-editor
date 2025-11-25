  Architecture

  - Centralize DnD ID conventions and parsing. Add helpers like
  makeFolderDroppableId, isFolderDroppableId, and resolveSortableId in a small
  util to remove string-literal scattering of folder:<id> across files (src/
  components/sidebar/tree/tree-types.ts, src/components/sidebar/tree/sidebar-
  tree.tsx:326, src/components/sidebar/hooks/use-markdown-explorer.ts:703).
  - Extract drop zone math into a single utility. The “relativeY” thresholding
  lives in two places (src/components/sidebar/tree/sidebar-tree.tsx:339,
  src/components/sidebar/tree/sidebar-tree.tsx:540) and in the handler
  (src/components/sidebar/hooks/use-markdown-explorer.ts:730). Create
  getDropPosition(active, over) and use everywhere.
  - Consider a custom collisionDetection that yields “virtual” targets for top/
  middle/bottom. That removes the need to map between droppable vs sortable IDs
  and simplifies the handler logic.
  - Keep a singular droppable per row if possible. The current dual model
  (sortable + inner droppable) increases complexity; virtual targets or a single
  droppable with zones would be simpler.

  UX/Behavior

  - Add a slight open delay on folder hover (e.g., 250–400ms) with cancellation
  on leave to avoid flicker and accidental expansion (src/components/sidebar/tree/
  sidebar-tree.tsx:333). Maintain a separate “expandedByDnD” state so user-open
  state isn’t permanently altered, and restore at onDragEnd.
  - Improve inside-folder indicator. For middle zone, show a subtle “insert at top
  of folder” line or chip inside the opened folder to clarify where the item will
  land, not just “inside” broadly.
  - Make top/bottom lines slimmer and sticky. A 1–2px line with an icon label
  tends to read better than a full pill for top/bottom; keep the pill for middle.
  - Keyboard parity. Add “Move up/down” commands in the context menu and arrow-key
  reordering for A11Y.

  Data + Backend

  - Finish the data normalization plan. Enforce non-null defaults for sort_order
  and backfill old rows; then remove the UI “default to 0” fallbacks. This reduces
  guard/branch complexity and odd edge cases (see docs/sidebar-root-drop-refactor-
  plan.md).
  - Minimize writes when reordering. Today assignSortOrders rewrites all siblings
  with (index+1)*1000 (src/components/sidebar/hooks/use-markdown-explorer.ts:487).
  Switch to a “between two neighbors” strategy (fractional/lexo-like keys) to
  update only the moved item most of the time.
  - Consider a single API to “move + set index” atomically server-side.
  Avoid two-step “re-number source, then compute + move” (search for
  Promise.all([sourcePromise, targetPromise]) at src/components/sidebar/hooks/use-
  markdown-explorer.ts:760).

  Code Quality

  - Strongly type DnD data payloads. Define a DndData discriminated union and use
  narrow type guards for over.data.current and active.data.current, eliminating
  optional chaining and string checks.
  - Remove duplication and inlined constants. Pull thresholds (0.25/0.75/0.5) into
  named constants with comments for rationale, used by both tree and handler.
  - Encapsulate “context” lookups. The findContext/findFolderByPath logic is
  solid; move it to a small module and reuse consistently in handler and UI
  instead of ad hoc (src/components/sidebar/hooks/use-markdown-explorer.ts:640).