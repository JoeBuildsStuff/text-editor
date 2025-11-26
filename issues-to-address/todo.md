I'll expand on each improvement with detailed descriptions of what needs to be accomplished, why it matters, and specific implementation guidance.

---

## 1. Extract the Massive `handleDragEnd` Function

### Problem Description

The `handleDragEnd` callback in `use-markdown-explorer.ts` (lines 456-588) is approximately 200 lines of deeply nested conditional logic. It handles at least six distinct scenarios: document reordering within the same folder, document moving to a different folder, document dropping into a folder's middle zone, folder reordering, folder moving to another folder, and folder dropping into the root zone. This violates the Single Responsibility Principle and makes the code extremely difficult to test, debug, and modify.

### What Needs to Be Accomplished

Create a new file `hooks/drag-end-handlers.ts` that exports individual handler functions for each drop scenario. Each handler should accept a standardized context object containing the parsed drag data, drop target information, tree state, and necessary callbacks.

First, define a discriminated union type for drop scenarios:

```typescript
// hooks/drag-end-types.ts
export type DropScenario =
  | {
      type: 'reorder-same-parent'
      activeId: string
      overId: string
      siblings: SidebarTreeElement[]
      oldIndex: number
      newIndex: number
      itemType: 'document' | 'folder'
    }
  | {
      type: 'move-to-different-parent'
      activeId: string
      activeType: 'document' | 'folder'
      targetParentPath: string | undefined
      insertionIndex: number
      targetSiblings: SidebarTreeElement[]
    }
  | {
      type: 'drop-into-folder-middle'
      activeId: string
      activeType: 'document' | 'folder'
      targetFolderPath: string
      targetFolderChildren: SidebarTreeElement[]
    }
  | {
      type: 'drop-into-root'
      activeId: string
      activeType: 'document' | 'folder'
      rootChildren: SidebarTreeElement[]
    }
  | { type: 'no-op'; reason: string }
```

Then create a resolver function that analyzes the drag event and returns the appropriate scenario:

```typescript
// hooks/resolve-drop-scenario.ts
export function resolveDropScenario(
  event: DragEndEvent,
  treeElements: SidebarTreeElement[]
): DropScenario {
  const { active, over } = event
  if (!over) return { type: 'no-op', reason: 'no-drop-target' }

  const activeData = active.data.current as DragData
  const overData = over.data.current as DragData | { type: 'root' }

  // Calculate drop zone (top/middle/bottom)
  const dropZone = calculateDropZone(active, over)

  // Determine if same parent
  const activeContext = findElementContext(treeElements, active.id as string)
  const overContext = findElementContext(treeElements, over.id as string)

  if (!activeContext) return { type: 'no-op', reason: 'active-not-found' }

  // ... logic to determine which scenario applies
}
```

Create individual handler functions that are pure and testable:

```typescript
// hooks/drag-end-handlers.ts
export async function handleReorderSameParent(
  scenario: Extract<DropScenario, { type: 'reorder-same-parent' }>,
  actions: {
    assignSortOrders: (items: SidebarTreeElement[], options?: { onlyMoveId?: string }) => { promise: Promise<void> }
    loadDocuments: (options?: { silent?: boolean }) => Promise<void>
  }
): Promise<void> {
  const newOrderArray = arrayMove([...scenario.siblings], scenario.oldIndex, scenario.newIndex)
  const { promise } = actions.assignSortOrders(newOrderArray, { onlyMoveId: scenario.activeId })
  await promise
  await actions.loadDocuments({ silent: true })
}

export async function handleMoveToFolder(
  scenario: Extract<DropScenario, { type: 'drop-into-folder-middle' }>,
  actions: {
    moveDocument: (id: string, targetPath?: string, sortOrder?: number) => Promise<void>
    moveFolder: (path: string, targetPath?: string, sortOrder?: number) => Promise<void>
    computeSortOrder: (prev?: number, next?: number) => number
  }
): Promise<void> {
  const lastSortOrder = scenario.targetFolderChildren.length > 0
    ? scenario.targetFolderChildren[scenario.targetFolderChildren.length - 1].sortOrder
    : undefined
  const newSortOrder = actions.computeSortOrder(lastSortOrder as number | undefined, undefined)

  if (scenario.activeType === 'document') {
    await actions.moveDocument(scenario.activeId, scenario.targetFolderPath, newSortOrder)
  } else {
    await actions.moveFolder(scenario.activeId, scenario.targetFolderPath, newSortOrder)
  }
}
```

Finally, refactor `handleDragEnd` to be a thin orchestrator:

```typescript
const handleDragEnd = useCallback(
  (event: DragEndEvent) => {
    setActiveDragLabel(null)

    const scenario = resolveDropScenario(event, treeElements)

    if (scenario.type === 'no-op') {
      return
    }

    startActionTransition(async () => {
      try {
        switch (scenario.type) {
          case 'reorder-same-parent':
            await handleReorderSameParent(scenario, { assignSortOrders, loadDocuments })
            break
          case 'drop-into-folder-middle':
            await handleMoveToFolder(scenario, { moveDocument: triggerMoveDocument, moveFolder: triggerMoveFolder, computeSortOrder: computeSortOrderBetween })
            break
          // ... other cases
        }
      } catch (error) {
        console.error('Drop operation failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to complete drag operation')
      }
    })
  },
  [treeElements, assignSortOrders, loadDocuments, triggerMoveDocument, startActionTransition]
)
```

### Testing Strategy

Each handler function can now be unit tested in isolation by providing mock scenarios and verifying the correct actions are called with the correct parameters. The resolver function can be tested with various event configurations to ensure it correctly identifies scenarios.

---

## 2. Consolidate Duplicated Tree Traversal Logic

### Problem Description

The codebase contains at least four separate implementations of tree traversal logic: `findContext` (defined inline in `handleDragEnd`), `findFolderByPath` (also inline in `handleDragEnd`), `findParentFolders` (in the `autoOpenFolders` memo), and the implicit traversal in `buildDocumentsTree`. Each implementation walks the tree recursively but returns different shapes of data. This duplication increases maintenance burden and creates opportunities for inconsistent behavior.

### What Needs to Be Accomplished

Create a generic tree traversal utility in `tree/tree-utils.ts` that accepts a visitor function and can be composed to implement all current use cases.

Define the core traversal function:

```typescript
// tree/tree-utils.ts

export type TraversalContext = {
  element: SidebarTreeElement
  parent: SidebarTreeElement | null
  siblings: SidebarTreeElement[]
  index: number
  path: SidebarTreeElement[]
  depth: number
}

export type TraversalVisitor<T> = (context: TraversalContext) => T | undefined | void

export function traverseTree<T>(
  elements: SidebarTreeElement[],
  visitor: TraversalVisitor<T>,
  options?: { earlyExit?: boolean }
): T | undefined {
  const earlyExit = options?.earlyExit ?? true

  function walk(
    currentElements: SidebarTreeElement[],
    parent: SidebarTreeElement | null,
    path: SidebarTreeElement[],
    depth: number
  ): T | undefined {
    for (let index = 0; index < currentElements.length; index++) {
      const element = currentElements[index]
      const context: TraversalContext = {
        element,
        parent,
        siblings: currentElements,
        index,
        path,
        depth,
      }

      const result = visitor(context)

      if (result !== undefined && earlyExit) {
        return result
      }

      if (element.children && element.children.length > 0) {
        const childResult = walk(
          element.children,
          element,
          [...path, element],
          depth + 1
        )

        if (childResult !== undefined && earlyExit) {
          return childResult
        }
      }
    }

    return undefined
  }

  return walk(elements, null, [], 0)
}
```

Build specific finder functions using the generic traversal:

```typescript
// tree/tree-finders.ts

export type ElementContext = {
  element: SidebarTreeElement
  parent: SidebarTreeElement | null
  siblings: SidebarTreeElement[]
  index: number
  ancestorPath: SidebarTreeElement[]
}

export function findElementById(
  elements: SidebarTreeElement[],
  targetId: string
): ElementContext | null {
  const result = traverseTree(elements, (ctx) => {
    if (ctx.element.id === targetId) {
      return {
        element: ctx.element,
        parent: ctx.parent,
        siblings: ctx.siblings,
        index: ctx.index,
        ancestorPath: ctx.path,
      }
    }
  })

  return result ?? null
}

export function findFolderByPath(
  elements: SidebarTreeElement[],
  targetPath: string | undefined
): SidebarTreeElement | null {
  if (targetPath === undefined) {
    // Return a synthetic root element
    return {
      id: DOCUMENTS_ROOT_ID,
      name: 'root',
      isSelectable: false,
      kind: 'folder',
      folderPath: undefined,
      children: elements,
    }
  }

  const result = traverseTree(elements, (ctx) => {
    if (ctx.element.kind === 'folder' && ctx.element.folderPath === targetPath) {
      return ctx.element
    }
  })

  return result ?? null
}

export function findAncestorFolderIds(
  elements: SidebarTreeElement[],
  targetSlug: string
): string[] {
  const result = traverseTree(elements, (ctx) => {
    if (ctx.element.kind === 'document' && ctx.element.id === targetSlug) {
      return ctx.path.map((ancestor) => ancestor.id)
    }
  })

  return result ?? []
}

export function collectAllFolderPaths(elements: SidebarTreeElement[]): string[] {
  const paths: string[] = []

  traverseTree(
    elements,
    (ctx) => {
      if (ctx.element.kind === 'folder' && ctx.element.folderPath) {
        paths.push(ctx.element.folderPath)
      }
    },
    { earlyExit: false }
  )

  return paths
}
```

Update `use-markdown-explorer.ts` to use these utilities:

```typescript
// Before (inline in handleDragEnd)
const findContext = (
  elements: SidebarTreeElement[],
  targetId: string
): { parent: SidebarTreeElement | null; siblings: SidebarTreeElement[] } | null => {
  for (const el of elements) {
    if (el.id === targetId) {
      return { parent: null, siblings: elements }
    }
    if (el.children) {
      const found = el.children.find((child) => child.id === targetId)
      if (found) return { parent: el, siblings: el.children }
      const deep = findContext(el.children, targetId)
      if (deep) return deep
    }
  }
  return null
}

// After (imported utility)
import { findElementById, findFolderByPath, findAncestorFolderIds } from './tree/tree-finders'

// Usage in handleDragEnd
const activeContext = findElementById(treeElements, activeId)
const overContext = findElementById(treeElements, overId)

// Usage in autoOpenFolders memo
const autoOpenFolders = useMemo(() => {
  if (!selectedSlug || !treeElements.length) return []
  return findAncestorFolderIds(treeElements, selectedSlug)
}, [selectedSlug, treeElements])
```

### Benefits

This consolidation provides a single source of truth for tree traversal, makes the traversal behavior consistent across all use cases, enables easier testing of tree operations, and reduces the overall code size by eliminating duplicated recursive logic.

---

## 3. Type-Safe Drag Data with Discriminated Unions

### Problem Description

Throughout the drag-and-drop code, the `data.current` property from dnd-kit events is typed as `unknown` or accessed with inline type assertions like `activeData as { type?: string; label?: string }`. This weak typing means TypeScript cannot catch errors when accessing properties that don't exist for certain drag types, and developers must manually remember which properties exist on which drag data types.

### What Needs to Be Accomplished

Define proper discriminated union types for all drag data variants in `tree/tree-types.ts`:

```typescript
// tree/tree-types.ts

export type DocumentDragData = {
  type: 'document'
  documentId: string
  slug: string
  currentFolderPath: string | undefined
  label: string
  sortOrder: number
}

export type FolderDragData = {
  type: 'folder'
  folderPath: string | undefined
  label: string
  sortOrder: number
}

export type RootDroppableData = {
  type: 'root'
}

export type DragData = DocumentDragData | FolderDragData
export type DroppableData = DragData | RootDroppableData
```

Create type guard functions for runtime type narrowing:

```typescript
// tree/tree-types.ts

export function isDocumentDragData(data: unknown): data is DocumentDragData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    obj.type === 'document' &&
    typeof obj.documentId === 'string' &&
    typeof obj.slug === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.sortOrder === 'number'
  )
}

export function isFolderDragData(data: unknown): data is FolderDragData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    obj.type === 'folder' &&
    typeof obj.label === 'string' &&
    typeof obj.sortOrder === 'number' &&
    (obj.folderPath === undefined || typeof obj.folderPath === 'string')
  )
}

export function isDragData(data: unknown): data is DragData {
  return isDocumentDragData(data) || isFolderDragData(data)
}

export function isRootDroppableData(data: unknown): data is RootDroppableData {
  if (typeof data !== 'object' || data === null) return false
  return (data as Record<string, unknown>).type === 'root'
}
```

Create a helper to safely extract and validate drag data from events:

```typescript
// tree/dnd-utils.ts

export type ParsedDragEvent = {
  activeData: DragData
  overData: DroppableData
  activeRect: DOMRect | null
  overRect: DOMRect | null
}

export function parseDragEvent(event: DragEndEvent): ParsedDragEvent | null {
  const { active, over } = event

  if (!over) return null

  const activeData = active.data.current
  const overData = over.data.current

  if (!isDragData(activeData)) {
    console.warn('Invalid active drag data:', activeData)
    return null
  }

  if (!isDragData(overData) && !isRootDroppableData(overData)) {
    console.warn('Invalid over drag data:', overData)
    return null
  }

  return {
    activeData,
    overData,
    activeRect: active.rect.current.translated ?? null,
    overRect: over.rect ?? null,
  }
}
```

Update the sortable components to use typed data:

```typescript
// In DocumentTreeNode
const {
  attributes,
  listeners,
  setNodeRef,
  transition,
} = useSortable({
  id: element.id,
  data: {
    type: 'document',
    documentId: element.documentId,
    slug: element.id,
    currentFolderPath,
    label: element.name,
    sortOrder: element.sortOrder ?? 0,
  } satisfies DocumentDragData, // TypeScript will verify this matches the type
})

// In FolderTreeNode
const {
  attributes,
  listeners,
  setNodeRef: setSortableRef,
  transition,
} = useSortable({
  id: element.id,
  data: {
    type: 'folder',
    folderPath,
    sortOrder: (element.sortOrder ?? 0) as number,
    label: element.name,
  } satisfies FolderDragData,
})
```

Update `handleDragEnd` to use the parsed data:

```typescript
const handleDragEnd = useCallback(
  (event: DragEndEvent) => {
    setActiveDragLabel(null)

    const parsed = parseDragEvent(event)
    if (!parsed) return

    const { activeData, overData, activeRect, overRect } = parsed

    // Now TypeScript knows the exact shape of activeData and overData
    if (activeData.type === 'document') {
      // TypeScript knows activeData is DocumentDragData here
      const documentId = activeData.documentId // No type assertion needed
      const slug = activeData.slug
      // ...
    }

    if (overData.type === 'folder') {
      // TypeScript knows overData is FolderDragData here
      const targetPath = overData.folderPath
      // ...
    }
  },
  [/* deps */]
)
```

### Benefits

This approach catches type errors at compile time rather than runtime, provides IntelliSense support for available properties, makes the code self-documenting since types explicitly declare what data exists, and enables exhaustive checking with TypeScript's `never` type to ensure all cases are handled.

---

## 4. Replace Multiple `useState` Calls with `useReducer`

### Problem Description

The rename dialog functionality uses six separate `useState` calls that represent a single logical state: whether the dialog is open, what type of entity is being renamed, the entity's identifier, and the name values. These states are always updated together (when opening the dialog, all values are set simultaneously), which creates multiple re-renders and makes it easy to accidentally leave states out of sync.

### What Needs to Be Accomplished

Create a reducer that manages rename dialog state as a single atomic unit:

```typescript
// hooks/rename-dialog-reducer.ts

export type RenameDialogState =
  | { status: 'closed' }
  | {
      status: 'open'
      entityType: 'document'
      documentId: string
      currentName: string
      newName: string
    }
  | {
      status: 'open'
      entityType: 'folder'
      folderPath: string
      currentName: string
      newName: string
    }

export type RenameDialogAction =
  | { type: 'OPEN_FOR_DOCUMENT'; documentId: string; currentName: string }
  | { type: 'OPEN_FOR_FOLDER'; folderPath: string; currentName: string }
  | { type: 'UPDATE_NEW_NAME'; newName: string }
  | { type: 'CLOSE' }

export const initialRenameDialogState: RenameDialogState = { status: 'closed' }

export function renameDialogReducer(
  state: RenameDialogState,
  action: RenameDialogAction
): RenameDialogState {
  switch (action.type) {
    case 'OPEN_FOR_DOCUMENT':
      return {
        status: 'open',
        entityType: 'document',
        documentId: action.documentId,
        currentName: action.currentName,
        newName: action.currentName,
      }

    case 'OPEN_FOR_FOLDER':
      return {
        status: 'open',
        entityType: 'folder',
        folderPath: action.folderPath,
        currentName: action.currentName,
        newName: action.currentName,
      }

    case 'UPDATE_NEW_NAME':
      if (state.status === 'closed') return state
      return { ...state, newName: action.newName }

    case 'CLOSE':
      return { status: 'closed' }

    default:
      return state
  }
}
```

Create a custom hook that encapsulates the reducer and provides a clean API:

```typescript
// hooks/use-rename-dialog.ts

import { useReducer, useCallback } from 'react'
import {
  renameDialogReducer,
  initialRenameDialogState,
  type RenameDialogState,
} from './rename-dialog-reducer'

export type UseRenameDialogReturn = {
  state: RenameDialogState
  openForDocument: (documentId: string, currentName: string) => void
  openForFolder: (folderPath: string, currentName: string) => void
  updateNewName: (newName: string) => void
  close: () => void
  isOpen: boolean
  canSubmit: boolean
}

export function useRenameDialog(): UseRenameDialogReturn {
  const [state, dispatch] = useReducer(renameDialogReducer, initialRenameDialogState)

  const openForDocument = useCallback((documentId: string, currentName: string) => {
    dispatch({ type: 'OPEN_FOR_DOCUMENT', documentId, currentName })
  }, [])

  const openForFolder = useCallback((folderPath: string, currentName: string) => {
    dispatch({ type: 'OPEN_FOR_FOLDER', folderPath, currentName })
  }, [])

  const updateNewName = useCallback((newName: string) => {
    dispatch({ type: 'UPDATE_NEW_NAME', newName })
  }, [])

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE' })
  }, [])

  const isOpen = state.status === 'open'

  const canSubmit =
    state.status === 'open' &&
    state.newName.trim().length > 0 &&
    state.newName.trim() !== state.currentName

  return {
    state,
    openForDocument,
    openForFolder,
    updateNewName,
    close,
    isOpen,
    canSubmit,
  }
}
```

Update `use-markdown-explorer.ts` to use the new hook:

```typescript
// Before
const [renameDialogOpen, setRenameDialogOpen] = useState(false)
const [renameType, setRenameType] = useState<"document" | "folder">("document")
const [renameId, setRenameId] = useState("")
const [renamePath, setRenamePath] = useState("")
const [renameCurrentName, setRenameCurrentName] = useState("")
const [renameNewName, setRenameNewName] = useState("")

const handleRenameFolder = useCallback((folderPath: string, currentName: string) => {
  setRenameType("folder")
  setRenamePath(folderPath)
  setRenameCurrentName(currentName)
  setRenameNewName(currentName)
  setRenameDialogOpen(true)
}, [])

// After
const renameDialog = useRenameDialog()

const handleRenameFolder = useCallback((folderPath: string, currentName: string) => {
  renameDialog.openForFolder(folderPath, currentName)
}, [renameDialog])

const handleRenameDocument = useCallback((documentId: string, currentName: string) => {
  renameDialog.openForDocument(documentId, currentName)
}, [renameDialog])
```

Update the `RenameDialog` component to accept the new state shape:

```typescript
// rename-dialog.tsx

import type { RenameDialogState } from './hooks/rename-dialog-reducer'

export type RenameDialogProps = {
  state: RenameDialogState
  isPending: boolean
  onNewNameChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function RenameDialog({
  state,
  isPending,
  onNewNameChange,
  onSubmit,
  onClose,
}: RenameDialogProps) {
  if (state.status === 'closed') {
    return null
  }

  const nameLabel = state.entityType === 'folder' ? 'Folder' : 'Document'
  const canSubmit =
    state.newName.trim().length > 0 && state.newName.trim() !== state.currentName

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {nameLabel}</DialogTitle>
          <DialogDescription>
            Enter a new name for the {nameLabel.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={state.newName}
            onChange={(event) => onNewNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                onSubmit()
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
            placeholder={`Enter ${nameLabel.toLowerCase()} name`}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending || !canSubmit}>
            {isPending ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Benefits

State transitions become atomic (single dispatch updates all related values), the reducer is pure and easily testable, impossible states become unrepresentable (you cannot have an open dialog without the required data), and debugging is simpler since all state changes flow through the reducer.

---

## 5. Add Error Boundaries and Retry Logic

### Problem Description

The API calls in `markdown-actions.ts` fail immediately on any error without attempting retries for transient failures like network timeouts or 503 responses. Additionally, there's no error boundary around the sidebar component, so a runtime error in rendering or drag handling could crash the entire application.

### What Needs to Be Accomplished

First, add retry logic to the base request function:

```typescript
// api/markdown-actions.ts

type RetryOptions = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses: number[]
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateBackoff(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 100
  return Math.min(exponentialDelay + jitter, options.maxDelayMs)
}

async function markdownRequest<T>({
  method,
  body,
  errorMessage,
  signal,
  retry = DEFAULT_RETRY_OPTIONS,
}: MarkdownRequestOptions & { retry?: RetryOptions }): Promise<T | undefined> {
  let lastError: Error = new Error(errorMessage)

  for (let attempt = 0; attempt < retry.maxAttempts; attempt++) {
    // Check if aborted before attempting
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError')
    }

    try {
      const response = await fetch('/api/markdown', {
        method,
        headers: body ? JSON_HEADERS : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      })

      if (response.ok) {
        try {
          return (await response.json()) as T
        } catch {
          return undefined
        }
      }

      // Don't retry client errors (4xx) except specific ones
      if (response.status >= 400 && response.status < 500) {
        if (!retry.retryableStatuses.includes(response.status)) {
          lastError = await extractErrorFromResponse(response, errorMessage)
          break
        }
      }

      // Server error or retryable status - will retry
      lastError = new Error(`Server error: ${response.status}`)

      if (attempt < retry.maxAttempts - 1) {
        const backoffMs = calculateBackoff(attempt, retry)
        await delay(backoffMs)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      lastError = error instanceof Error ? error : new Error(String(error))

      // Network errors are retryable
      if (attempt < retry.maxAttempts - 1) {
        const backoffMs = calculateBackoff(attempt, retry)
        await delay(backoffMs)
      }
    }
  }

  throw lastError
}

async function extractErrorFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  try {
    const data = (await response.json()) as { error?: string; message?: string }
    const message = data?.error ?? data?.message ?? fallbackMessage
    return new Error(message)
  } catch {
    return new Error(fallbackMessage)
  }
}
```

Create an error boundary component for the sidebar:

```typescript
// components/sidebar/sidebar-error-boundary.tsx

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  onReset?: () => void
}

type State = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class SidebarErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log to error reporting service
    console.error('Sidebar error boundary caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
          <h3 className="font-semibold text-sm mb-2">Something went wrong</h3>
          <p className="text-xs text-muted-foreground mb-4">
            The sidebar encountered an error. Your documents are safe.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            <RefreshCw className="h-3 w-3 mr-2" />
            Try Again
          </Button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-4 text-xs text-left bg-muted p-2 rounded overflow-auto max-w-full">
              {this.state.error.message}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
```

Wrap the sidebar content with the error boundary:

```typescript
// app-sidebar.tsx

import { SidebarErrorBoundary } from './sidebar-error-boundary'

export function AppSidebar() {
  const explorer = useMarkdownExplorer()

  const handleErrorReset = useCallback(() => {
    explorer.refetch()
  }, [explorer])

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarLogo />
        </SidebarHeader>

        <SidebarErrorBoundary onReset={handleErrorReset}>
          {/* ... rest of sidebar content */}
        </SidebarErrorBoundary>

        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      <RenameDialog {...explorer.renameDialogProps} />
    </>
  )
}
```

Add request timeout handling:

```typescript
// api/markdown-actions.ts

function createTimeoutSignal(timeoutMs: number, existingSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timeout', 'TimeoutError'))
  }, timeoutMs)

  // If there's an existing signal, abort when it aborts
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      controller.abort(existingSignal.reason)
    })
  }

  // Clean up timeout if request completes
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId)
  })

  return controller.signal
}

// Usage in request function
async function markdownRequest<T>({
  method,
  body,
  errorMessage,
  signal,
  timeoutMs = 30000,
  retry = DEFAULT_RETRY_OPTIONS,
}: MarkdownRequestOptions & { timeoutMs?: number; retry?: RetryOptions }): Promise<T | undefined> {
  const timeoutSignal = createTimeoutSignal(timeoutMs, signal)
  // ... use timeoutSignal instead of signal in fetch
}
```

### Benefits

Transient network failures are handled gracefully without user intervention, the application remains functional even if the sidebar encounters errors, users see helpful error states instead of white screens, and error telemetry helps identify issues in production.

---

## 6. Memoize Expensive Callbacks Properly

### Problem Description

Several callbacks in `use-markdown-explorer.ts` include `treeElements` or other frequently-changing values in their dependency arrays. Since `treeElements` is a new array reference after every data fetch, these callbacks are recreated unnecessarily, causing downstream components to re-render even when the callback logic hasn't actually changed.

### What Needs to Be Accomplished

Use refs to access latest values without including them in dependency arrays:

```typescript
// hooks/use-markdown-explorer.ts

// Create refs for values that change frequently but shouldn't cause callback recreation
const treeElementsRef = useRef(treeElements)
const documentsRef = useRef(documents)
const foldersRef = useRef(folders)
const selectedSlugRef = useRef(selectedSlug)

// Keep refs updated
useEffect(() => {
  treeElementsRef.current = treeElements
}, [treeElements])

useEffect(() => {
  documentsRef.current = documents
}, [documents])

useEffect(() => {
  foldersRef.current = folders
}, [folders])

useEffect(() => {
  selectedSlugRef.current = selectedSlug
}, [selectedSlug])

// Now callbacks can use refs instead of direct values
const handleDragEnd = useCallback(
  (event: DragEndEvent) => {
    setActiveDragLabel(null)

    const { active, over } = event
    if (!over) return

    // Use ref to get current tree elements
    const currentTreeElements = treeElementsRef.current

    const findContext = (targetId: string) => {
      return findElementById(currentTreeElements, targetId)
    }

    // ... rest of logic using currentTreeElements
  },
  // Dependencies are now stable - only include functions and setters
  [triggerMoveDocument, assignSortOrders, loadDocuments, startActionTransition]
)
```

Create a custom hook to manage the ref pattern:

```typescript
// hooks/use-latest-ref.ts

import { useRef, useEffect, type MutableRefObject } from 'react'

export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}

// Alternative: return getter function for cleaner API
export function useLatestValue<T>(value: T): () => T {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return useCallback(() => ref.current, [])
}
```

Apply the pattern throughout the hook:

```typescript
// hooks/use-markdown-explorer.ts

import { useLatestRef, useLatestValue } from './use-latest-ref'

export function useMarkdownExplorer(): MarkdownExplorerResult {
  // ... existing code ...

  const treeElements = useMemo(
    () => buildDocumentsTree(documents, folders),
    [documents, folders]
  )

  // Create stable accessors
  const getTreeElements = useLatestValue(treeElements)
  const getDocuments = useLatestValue(documents)
  const getFolders = useLatestValue(folders)
  const getSelectedSlug = useLatestValue(selectedSlug)

  // Callbacks now have stable dependencies
  const deleteDocumentById = useCallback(
    async (documentId: string, slug?: string) => {
      const currentSelectedSlug = getSelectedSlug()
      // ... logic using currentSelectedSlug
    },
    [getSelectedSlug, loadDocuments, router, setMarkdownIndex]
  )

  const assignSortOrders = useCallback(
    (items: SidebarTreeElement[], options?: { onlyMoveId?: string }) => {
      const currentFolders = getFolders()
      // ... logic using currentFolders
    },
    [getFolders, updateSortOrder]
  )
}
```

Verify memoization is working correctly by adding a development-only check:

```typescript
// hooks/use-callback-stability.ts (development only)

import { useRef, useEffect } from 'react'

export function useCallbackStability(name: string, callback: Function, deps: unknown[]): void {
  if (process.env.NODE_ENV !== 'development') return

  const countRef = useRef(0)
  const prevDepsRef = useRef<unknown[]>([])

  useEffect(() => {
    countRef.current += 1

    const changedIndices: number[] = []
    deps.forEach((dep, i) => {
      if (!Object.is(dep, prevDepsRef.current[i])) {
        changedIndices.push(i)
      }
    })

    if (changedIndices.length > 0 && countRef.current > 1) {
      console.debug(
        `[useCallbackStability] ${name} recreated (${countRef.current}x)`,
        `Changed deps at indices: ${changedIndices.join(', ')}`
      )
    }

    prevDepsRef.current = deps
  })
}

// Usage during development
useCallbackStability('handleDragEnd', handleDragEnd, [
  triggerMoveDocument,
  assignSortOrders,
  loadDocuments,
  startActionTransition,
])
```

### Benefits

Components that receive callbacks as props don't re-render unnecessarily, drag-and-drop performance improves since event handlers remain stable, React DevTools shows cleaner component update patterns, and memory usage decreases from fewer function allocations.

---

## 7. Extract Custom Hooks from the Monolithic Hook

### Problem Description

`useMarkdownExplorer` is approximately 600 lines and handles data fetching, derived state, navigation, folder open/close state, CRUD actions, rename dialog state, and drag-and-drop logic. This makes it difficult to understand, test, modify, and reuse individual pieces of functionality.

### What Needs to Be Accomplished

Identify logical boundaries and extract focused hooks:

```typescript
// hooks/use-markdown-data.ts
// Handles data fetching and mutations

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { fetchMarkdownIndex } from '../api/markdown-actions'
import type { MarkdownDocument, MarkdownFolder } from '../tree/tree-types'

const QUERY_KEY = ['markdown-index'] as const

export type UseMarkdownDataReturn = {
  documents: MarkdownDocument[]
  folders: MarkdownFolder[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  invalidate: () => Promise<void>
  setDocuments: (updater: (docs: MarkdownDocument[]) => MarkdownDocument[]) => void
  setFolders: (updater: (folders: MarkdownFolder[]) => MarkdownFolder[]) => void
}

export function useMarkdownData(): UseMarkdownDataReturn {
  const queryClient = useQueryClient()

  const {
    data: markdownIndex,
    error: markdownError,
    isPending,
    refetch: refetchQuery,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => fetchMarkdownIndex(signal),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  const documents = useMemo(() => markdownIndex?.documents ?? [], [markdownIndex])
  const folders = useMemo(() => markdownIndex?.folders ?? [], [markdownIndex])

  const refetch = useCallback(async () => {
    await refetchQuery()
  }, [refetchQuery])

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }, [queryClient])

  const setDocuments = useCallback(
    (updater: (docs: MarkdownDocument[]) => MarkdownDocument[]) => {
      queryClient.setQueryData<{ documents: MarkdownDocument[]; folders: MarkdownFolder[] }>(
        QUERY_KEY,
        (current) => {
          if (!current) return current
          return { ...current, documents: updater(current.documents) }
        }
      )
    },
    [queryClient]
  )

  const setFolders = useCallback(
    (updater: (folders: MarkdownFolder[]) => MarkdownFolder[]) => {
      queryClient.setQueryData<{ documents: MarkdownDocument[]; folders: MarkdownFolder[] }>(
        QUERY_KEY,
        (current) => {
          if (!current) return current
          return { ...current, folders: updater(current.folders) }
        }
      )
    },
    [queryClient]
  )

  return {
    documents,
    folders,
    isLoading: isPending && !markdownIndex,
    error: markdownError instanceof Error ? markdownError.message : null,
    refetch,
    invalidate,
    setDocuments,
    setFolders,
  }
}
```

```typescript
// hooks/use-folder-state.ts
// Manages which folders are open/closed

import { useState, useCallback, useMemo, useEffect } from 'react'
import { DOCUMENTS_ROOT_ID, type SidebarTreeElement } from '../tree/tree-types'
import { findAncestorFolderIds } from '../tree/tree-finders'

export type UseFolderStateReturn = {
  openFolders: Set<string>
  toggleFolder: (folderId: string) => void
  openFolderPath: (folderPath?: string) => void
  closeFolderPath: (folderPath: string) => void
  openFoldersForSlug: (slug: string) => void
}

export function useFolderState(
  treeElements: SidebarTreeElement[],
  selectedSlug?: string
): UseFolderStateReturn {
  const [manualOpenFolders, setManualOpenFolders] = useState<Set<string>>(new Set())

  // Auto-open folders containing the selected document
  const autoOpenFolders = useMemo(() => {
    if (!selectedSlug || !treeElements.length) return []
    return findAncestorFolderIds(treeElements, selectedSlug)
  }, [selectedSlug, treeElements])

  // Combine manual and auto-open folders
  const openFolders = useMemo(() => {
    const combined = new Set(manualOpenFolders)
    autoOpenFolders.forEach((id) => combined.add(id))
    return combined
  }, [manualOpenFolders, autoOpenFolders])

  const toggleFolder = useCallback((folderId: string) => {
    setManualOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const openFolderPath = useCallback((folderPath?: string) => {
    if (!folderPath) return

    const segments = folderPath.split('/').filter(Boolean)
    if (!segments.length) return

    setManualOpenFolders((prev) => {
      const next = new Set(prev)
      segments.forEach((_, index) => {
        const partial = segments.slice(0, index + 1).join('/')
        next.add(`${DOCUMENTS_ROOT_ID}/${partial}`)
      })
      return next
    })
  }, [])

  const closeFolderPath = useCallback((folderPath: string) => {
    const targetPrefix = `${DOCUMENTS_ROOT_ID}/${folderPath}`

    setManualOpenFolders((prev) => {
      return new Set(
        [...prev].filter((id) => id !== targetPrefix && !id.startsWith(`${targetPrefix}/`))
      )
    })
  }, [])

  const openFoldersForSlug = useCallback(
    (slug: string) => {
      const ancestorIds = findAncestorFolderIds(treeElements, slug)
      if (ancestorIds.length) {
        setManualOpenFolders((prev) => {
          const next = new Set(prev)
          ancestorIds.forEach((id) => next.add(id))
          return next
        })
      }
    },
    [treeElements]
  )

  return {
    openFolders,
    toggleFolder,
    openFolderPath,
    closeFolderPath,
    openFoldersForSlug,
  }
}
```

```typescript
// hooks/use-document-navigation.ts
// Handles URL-based document selection

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { buildDocumentsPath } from '../tree/tree-utils'

export type UseDocumentNavigationReturn = {
  selectedSlug: string | undefined
  navigateToSlug: (slug: string) => void
  navigateToDocuments: () => void
  updateSlugInPlace: (newSlug: string) => void
}

export function useDocumentNavigation(): UseDocumentNavigationReturn {
  const pathname = usePathname()
  const router = useRouter()

  const selectedSlug = useMemo(() => {
    if (!pathname.startsWith('/documents')) return undefined

    const segments = pathname.split('/').slice(2).filter(Boolean)
    if (!segments.length) return undefined

    return segments.map((segment) => decodeURIComponent(segment)).join('/')
  }, [pathname])

  const navigateToSlug = useCallback(
    (slug: string) => {
      router.push(buildDocumentsPath(slug))
    },
    [router]
  )

  const navigateToDocuments = useCallback(() => {
    router.replace('/documents')
  }, [router])

  const updateSlugInPlace = useCallback(
    (newSlug: string) => {
      router.replace(buildDocumentsPath(newSlug))
    },
    [router]
  )

  return {
    selectedSlug,
    navigateToSlug,
    navigateToDocuments,
    updateSlugInPlace,
  }
}
```

```typescript
// hooks/use-tree-dnd.ts
// Encapsulates drag-and-drop logic

import { useCallback, useState } from 'react'
import {
  PointerSensor,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SIDEBAR_TREE_ROOT_DROPPABLE_ID, type SidebarTreeElement } from '../tree/tree-types'
import { resolveDropScenario, type DropScenario } from './resolve-drop-scenario'

export type UseTreeDndReturn = {
  sensors: ReturnType<typeof useSensors>
  collisionDetection: CollisionDetection
  activeDragLabel: string | null
  handleDragStart: (event: DragStartEvent) => void
  handleDragEnd: (event: DragEndEvent) => DropScenario
  handleDragCancel: () => void
}

export function useTreeDnd(treeElements: SidebarTreeElement[]): UseTreeDndReturn {
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const collisions = closestCenter(args)
    if (collisions.length <= 1) return collisions

    const nonRootCollisions = collisions.filter(
      (collision) => collision.id !== SIDEBAR_TREE_ROOT_DROPPABLE_ID
    )
    return nonRootCollisions.length ? nonRootCollisions : collisions
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; label?: string } | undefined
    if (data?.type === 'document' || data?.type === 'folder') {
      setActiveDragLabel(data.label ?? (data.type === 'folder' ? 'Folder' : 'Document'))
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent): DropScenario => {
      setActiveDragLabel(null)
      return resolveDropScenario(event, treeElements)
    },
    [treeElements]
  )

  const handleDragCancel = useCallback(() => {
    setActiveDragLabel(null)
  }, [])

  return {
    sensors,
    collisionDetection,
    activeDragLabel,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  }
}
```

Compose the hooks in the main hook:

```typescript
// hooks/use-markdown-explorer.ts

import { useMemo, useTransition, useCallback } from 'react'
import { toast } from 'sonner'

import { useMarkdownData } from './use-markdown-data'
import { useFolderState } from './use-folder-state'
import { useDocumentNavigation } from './use-document-navigation'
import { useRenameDialog } from './use-rename-dialog'
import { useTreeDnd } from './use-tree-dnd'
import { buildDocumentsTree } from '../tree/tree-utils'
import { useDocumentActions } from './use-document-actions'
import { useFolderActions } from './use-folder-actions'
import type { SidebarTreeProps } from '../tree/sidebar-tree'
import type { RenameDialogProps } from '../rename-dialog'

export type MarkdownExplorerResult = {
  isLoadingFiles: boolean
  filesError: string | null
  isActionPending: boolean
  hasTreeData: boolean
  treeProps: SidebarTreeProps
  createDocument: () => void
  createFolder: () => void
  renameDialogProps: RenameDialogProps
}

export function useMarkdownExplorer(): MarkdownExplorerResult {
  const [isActionPending, startActionTransition] = useTransition()

  // Compose smaller hooks
  const data = useMarkdownData()
  const navigation = useDocumentNavigation()
  const renameDialog = useRenameDialog()

  const treeElements = useMemo(
    () => buildDocumentsTree(data.documents, data.folders),
    [data.documents, data.folders]
  )

  const folderState = useFolderState(treeElements, navigation.selectedSlug)
  const dnd = useTreeDnd(treeElements)

  const documentActions = useDocumentActions({
    invalidateData: data.invalidate,
    setDocuments: data.setDocuments,
    navigateToSlug: navigation.navigateToSlug,
    navigateToDocuments: navigation.navigateToDocuments,
    openFolderPath: folderState.openFolderPath,
    selectedSlug: navigation.selectedSlug,
    startTransition: startActionTransition,
  })

  const folderActions = useFolderActions({
    invalidateData: data.invalidate,
    setFolders: data.setFolders,
    setDocuments: data.setDocuments,
    openFolderPath: folderState.openFolderPath,
    closeFolderPath: folderState.closeFolderPath,
    navigateToDocuments: navigation.navigateToDocuments,
    selectedSlug: navigation.selectedSlug,
    startTransition: startActionTransition,
  })

  // Handle drop scenarios
  const handleDragEndWithActions = useCallback(
    (event: DragEndEvent) => {
      const scenario = dnd.handleDragEnd(event)
      // Execute the appropriate action based on scenario
      executeDropScenario(scenario, { documentActions, folderActions, data })
    },
    [dnd, documentActions, folderActions, data]
  )

  // Assemble props objects
  const treeProps: SidebarTreeProps = {
    elements: treeElements,
    selectedSlug: navigation.selectedSlug,
    openFolders: folderState.openFolders,
    onToggleFolder: folderState.toggleFolder,
    isActionPending,
    onCreateDocument: documentActions.create,
    onCreateFolder: folderActions.create,
    onDeleteFolder: folderActions.delete,
    onDeleteDocument: documentActions.delete,
    onRenameFolder: renameDialog.openForFolder,
    onRenameDocument: renameDialog.openForDocument,
    onSelect: navigation.navigateToSlug,
    sensors: dnd.sensors,
    collisionDetection: dnd.collisionDetection,
    onDragStart: dnd.handleDragStart,
    onDragEnd: handleDragEndWithActions,
    onDragCancel: dnd.handleDragCancel,
    activeDragLabel: dnd.activeDragLabel,
  }

  return {
    isLoadingFiles: data.isLoading,
    filesError: data.error,
    isActionPending,
    hasTreeData: treeElements.length > 0,
    treeProps,
    createDocument: () => documentActions.create(),
    createFolder: () => folderActions.create(),
    renameDialogProps: buildRenameDialogProps(renameDialog, isActionPending, data, navigation),
  }
}
```

### Benefits

Each hook can be tested independently, hooks can be reused in other contexts (for example, `useFolderState` could power a folder picker component), the main hook becomes a readable composition of focused behaviors, changes to one area (like drag-and-drop) don't risk breaking unrelated functionality, and new developers can understand the codebase piece by piece.

---

## 8. Add Abort Controller Cleanup

### Problem Description

When a component unmounts while an async operation is in progress (like deleting a document), the operation continues and may attempt to update state on an unmounted component, causing React warnings and potentially corrupting application state. The optimistic update rollback logic also runs unnecessarily.

### What Needs to Be Accomplished

Create a hook to manage abort controllers tied to component lifecycle:

```typescript
// hooks/use-abort-controller.ts

import { useRef, useEffect, useCallback } from 'react'

export type AbortControllerManager = {
  getSignal: () => AbortSignal
  abort: (reason?: string) => void
  isAborted: () => boolean
}

export function useAbortController(): AbortControllerManager {
  const controllerRef = useRef<AbortController | null>(null)

  // Abort on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort('Component unmounted')
    }
  }, [])

  const getSignal = useCallback(() => {
    // Create new controller if none exists or previous was aborted
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController()
    }
    return controllerRef.current.signal
  }, [])

  const abort = useCallback((reason?: string) => {
    controllerRef.current?.abort(reason)
  }, [])

  const isAborted = useCallback(() => {
    return controllerRef.current?.signal.aborted ?? false
  }, [])

  return { getSignal, abort, isAborted }
}
```

Create a helper for operations that need individual abort controllers:

```typescript
// hooks/use-abortable-action.ts

import { useCallback, useRef, useEffect } from 'react'

export function useAbortableAction<T extends (...args: any[]) => Promise<any>>(
  action: (signal: AbortSignal, ...args: Parameters<T>) => ReturnType<T>
): [T, () => void] {
  const controllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      controllerRef.current?.abort('Component unmounted')
    }
  }, [])

  const wrappedAction = useCallback(
    ((...args: Parameters<T>) => {
      // Abort any previous in-flight request
      controllerRef.current?.abort('Superseded by new request')
      controllerRef.current = new AbortController()

      return action(controllerRef.current.signal, ...args)
    }) as T,
    [action]
  )

  const abort = useCallback(() => {
    controllerRef.current?.abort('Manually aborted')
  }, [])

  return [wrappedAction, abort]
}
```

Update API functions to accept and respect abort signals:

```typescript
// api/markdown-actions.ts

export async function deleteMarkdownDocument(id: string, signal?: AbortSignal): Promise<void> {
  await markdownRequest({
    method: 'DELETE',
    body: { id },
    errorMessage: 'Failed to delete document',
    signal,
  })
}

export async function moveMarkdownDocument(
  params: {
    id: string
    targetFolderPath?: string
    sortOrder?: number
  },
  signal?: AbortSignal
): Promise<MarkdownDocument | null> {
  const data = await markdownRequest<DocumentResponse>({
    method: 'PATCH',
    body: {
      id: params.id,
      targetFolderPath: params.targetFolderPath ?? null,
      sortOrder: params.sortOrder,
    },
    errorMessage: 'Failed to move document',
    signal,
  })
  return data?.document ?? null
}
```

Update action handlers to use abort signals and handle cancellation:

```typescript
// hooks/use-document-actions.ts

export function useDocumentActions(deps: DocumentActionDeps) {
  const abortController = useAbortController()

  const deleteDocument = useCallback(
    async (documentId: string, slug?: string) => {
      const signal = abortController.getSignal()

      // Optimistic update
      let removedDocument: MarkdownDocument | undefined
      let removedIndex = -1

      deps.setDocuments((current) => {
        const index = current.findIndex((doc) => doc.id === documentId)
        if (index === -1) return current

        removedIndex = index
        removedDocument = current[index]
        return [...current.slice(0, index), ...current.slice(index + 1)]
      })

      const shouldClearSelection = slug === deps.selectedSlug
      if (shouldClearSelection) {
        deps.navigateToDocuments()
      }

      try {
        await deleteMarkdownDocument(documentId, signal)

        // Check if aborted before continuing
        if (signal.aborted) return

        await deps.invalidateData()
        toast.success('Document deleted')
      } catch (error) {
        // Don't rollback or show error if aborted
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        // Rollback optimistic update
        if (removedDocument) {
          deps.setDocuments((current) => {
            if (current.some((doc) => doc.id === documentId)) return current
            const next = [...current]
            const insertIndex = Math.min(removedIndex, next.length)
            next.splice(insertIndex, 0, removedDocument!)
            return next
          })
        }

        if (shouldClearSelection && slug) {
          deps.navigateToSlug(slug)
        }

        throw error
      }
    },
    [deps, abortController]
  )

  // Wrap in transition
  const triggerDelete = useCallback(
    (documentId: string, slug?: string) => {
      deps.startTransition(() => {
        deleteDocument(documentId, slug).catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          console.error(error)
          toast.error(error instanceof Error ? error.message : 'Failed to delete document')
        })
      })
    },
    [deleteDocument, deps]
  )

  return {
    delete: triggerDelete,
    // ... other actions
  }
}
```

Add abort handling to the rename submission:

```typescript
// hooks/use-rename-dialog.ts

export function useRenameSubmission(
  state: RenameDialogState,
  deps: {
    invalidateData: () => Promise<void>
    updateSlugInPlace: (slug: string) => void
    close: () => void
    startTransition: TransitionStartFunction
  }
) {
  const [abortableSubmit] = useAbortableAction(
    async (signal: AbortSignal) => {
      if (state.status !== 'open') return

      const trimmedName = state.newName.trim()
      if (!trimmedName || trimmedName === state.currentName) {
        deps.close()
        return
      }

      if (state.entityType === 'folder') {
        await renameMarkdownFolder(state.folderPath, trimmedName, signal)

        if (signal.aborted) return

        await deps.invalidateData()
        toast.success(`Renamed folder to "${trimmedName}"`)
      } else {
        const document = await renameMarkdownDocument(state.documentId, trimmedName, signal)

        if (signal.aborted) return

        await deps.invalidateData()

        if (document?.slug) {
          deps.updateSlugInPlace(document.slug)
        }

        toast.success(`Renamed document to "${document?.title ?? trimmedName}"`)
      }

      deps.close()
    }
  )

  const submit = useCallback(() => {
    deps.startTransition(() => {
      abortableSubmit().catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error(error)
        toast.error(error instanceof Error ? error.message : 'Failed to rename')
      })
    })
  }, [abortableSubmit, deps])

  return submit
}
```

### Benefits

No React warnings about state updates on unmounted components, cleaner console output during development, prevents race conditions when rapid actions are performed, optimistic rollbacks only happen when they should, and network requests are properly cancelled, freeing resources.

---

## 9. Use Constants for Magic Numbers

### Problem Description

The codebase contains several magic numbers scattered throughout different files: `30_000` for stale time, `1000` for sort order steps, `6` for drag activation distance, `220` for animation duration, `0.25` and `0.75` for drop zone thresholds. These numbers are difficult to discover, understand, and maintain consistently.

### What Needs to Be Accomplished

Create a constants file with well-documented values:

```typescript
// constants/sidebar-constants.ts

/**
 * Time in milliseconds before cached markdown index data is considered stale.
 * During this window, React Query will return cached data immediately.
 */
export const MARKDOWN_INDEX_STALE_TIME_MS = 30_000

/**
 * Default step size when assigning sort orders to items.
 * Using a large step (1000) leaves room for insertions between items
 * without requiring resequencing of all siblings.
 */
export const SORT_ORDER_DEFAULT_STEP = 1000

/**
 * Minimum distance in pixels the pointer must move before a drag operation starts.
 * This prevents accidental drags when clicking items.
 */
export const DRAG_ACTIVATION_DISTANCE_PX = 6

/**
 * Duration in milliseconds for the drop animation.
 * The dragged item animates to its final position over this duration.
 */
export const DROP_ANIMATION_DURATION_MS = 220

/**
 * Threshold for determining "top" zone when dropping on a folder.
 * If the drag overlay's center is in the top 25% of the folder row,
 * the drop is interpreted as "insert before this folder".
 */
export const FOLDER_DROP_ZONE_TOP_THRESHOLD = 0.25

/**
 * Threshold for determining "bottom" zone when dropping on a folder.
 * If the drag overlay's center is in the bottom 25% of the folder row,
 * the drop is interpreted as "insert after this folder".
 */
export const FOLDER_DROP_ZONE_BOTTOM_THRESHOLD = 0.75

/**
 * Threshold for document drop zones.
 * Documents use a 50/50 split (no middle zone) since you can't drop into a document.
 */
export const DOCUMENT_DROP_ZONE_THRESHOLD = 0.5

/**
 * API retry configuration
 */
export const API_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  MAX_ATTEMPTS: 3,
  /** Base delay between retries in milliseconds */
  BASE_DELAY_MS: 200,
  /** Maximum delay cap in milliseconds */
  MAX_DELAY_MS: 2000,
  /** HTTP status codes that should trigger a retry */
  RETRYABLE_STATUSES: [408, 429, 500, 502, 503, 504] as const,
} as const

/**
 * Request timeout in milliseconds
 */
export const API_REQUEST_TIMEOUT_MS = 30_000

/**
 * Animation durations for UI transitions
 */
export const ANIMATION_DURATIONS = {
  /** Standard transition duration */
  DEFAULT_MS: 150,
  /** Slower transition for emphasis */
  SLOW_MS: 300,
  /** Quick micro-interactions */
  FAST_MS: 75,
} as const

/**
 * Sidebar-specific dimensions
 */
export const SIDEBAR_DIMENSIONS = {
  /** Minimum width of tree items */
  MIN_ITEM_WIDTH_PX: 120,
  /** Icon size in tree items */
  ICON_SIZE_PX: 14,
  /** Indentation per nesting level */
  INDENT_PX: 16,
} as const
```

Update all files to import from the constants file:

```typescript
// hooks/use-markdown-explorer.ts
import {
  MARKDOWN_INDEX_STALE_TIME_MS,
  DRAG_ACTIVATION_DISTANCE_PX,
  SORT_ORDER_DEFAULT_STEP,
} from '../constants/sidebar-constants'

const { data: markdownIndex } = useQuery({
  queryKey: MARKDOWN_INDEX_QUERY_KEY,
  queryFn: ({ signal }) => fetchMarkdownIndex(signal),
  refetchOnWindowFocus: false,
  staleTime: MARKDOWN_INDEX_STALE_TIME_MS,
})

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
  })
)
```

```typescript
// tree/dnd-utils.ts
import {
  FOLDER_DROP_ZONE_TOP_THRESHOLD,
  FOLDER_DROP_ZONE_BOTTOM_THRESHOLD,
  DOCUMENT_DROP_ZONE_THRESHOLD,
} from '../constants/sidebar-constants'

export function getDropPosition(
  activeRect: RectLike | null,
  overRect: RectLike | null,
  opts?: { top: number; bottom: number }
): 'top' | 'middle' | 'bottom' | null {
  if (!activeRect || !overRect) return null

  const top = opts?.top ?? FOLDER_DROP_ZONE_TOP_THRESHOLD
  const bottom = opts?.bottom ?? FOLDER_DROP_ZONE_BOTTOM_THRESHOLD

  // ... rest of function
}
```

```typescript
// tree/sidebar-tree.tsx
import { DROP_ANIMATION_DURATION_MS } from '../constants/sidebar-constants'

const animation = dragOverlay.node.animate(keyframes, {
  duration: DROP_ANIMATION_DURATION_MS,
  easing: 'ease-out',
  fill: 'forwards',
})
```

```typescript
// tree/tree-utils.ts
import { SORT_ORDER_DEFAULT_STEP } from '../constants/sidebar-constants'

export function computeSortOrderBetween(prev?: number, next?: number): number {
  if (typeof prev === 'number' && typeof next === 'number') {
    const gap = next - prev
    if (!Number.isFinite(gap) || gap <= 0) {
      return prev + 0.5
    }
    return prev + gap / 2
  }
  if (typeof prev === 'number') {
    return prev + SORT_ORDER_DEFAULT_STEP
  }
  if (typeof next === 'number') {
    return next / 2
  }
  return 0
}
```

### Benefits

Single source of truth for configuration values, documentation explains the purpose of each value, changes propagate consistently across the codebase, easier to tune behavior (just change one number), and constants can be exported for tests to use the same values.

---

## 10. Add Proper TypeScript Strict Null Checks

### Problem Description

Several places in the codebase use loose type assertions or ignore potential null/undefined values. For example, `folder.folderPath.split("/").pop()` could return undefined, but the code uses the nullish coalescing fallback without handling the empty string case properly. The `sortOrder` field is typed as `number` but may be undefined at runtime.

### What Needs to Be Accomplished

First, audit the types and add explicit optionality where values can be missing:

```typescript
// tree/tree-types.ts

export interface SidebarTreeElement extends TreeViewElement {
  children?: SidebarTreeElement[]
  kind: 'folder' | 'document'
  folderPath?: string
  documentId?: string
  documentPath?: string
  sortOrder?: number | undefined // Explicitly mark as possibly undefined
}

// Create helper types for narrowed states
export type FolderTreeElement = SidebarTreeElement & {
  kind: 'folder'
  folderPath: string
  children: SidebarTreeElement[]
}

export type DocumentTreeElement = SidebarTreeElement & {
  kind: 'document'
  documentId: string
  documentPath: string
}

// Type guards
export function isFolderElement(el: SidebarTreeElement): el is FolderTreeElement {
  return el.kind === 'folder' && typeof el.folderPath === 'string'
}

export function isDocumentElement(el: SidebarTreeElement): el is DocumentTreeElement {
  return (
    el.kind === 'document' &&
    typeof el.documentId === 'string' &&
    typeof el.documentPath === 'string'
  )
}
```

Create utility functions for common operations that handle edge cases:

```typescript
// utils/path-utils.ts

/**
 * Extracts the last segment of a path, handling edge cases.
 * Returns undefined if the path is empty or has no segments.
 */
export function getLastPathSegment(path: string | undefined | null): string | undefined {
  if (!path) return undefined

  const trimmed = path.trim()
  if (!trimmed) return undefined

  const segments = trimmed.split('/').filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : undefined
}

/**
 * Extracts the parent path from a full path.
 * Returns undefined for root-level paths.
 */
export function getParentPath(path: string | undefined | null): string | undefined {
  if (!path) return undefined

  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 1) return undefined

  return segments.slice(0, -1).join('/')
}

/**
 * Joins path segments, filtering out empty/null values.
 */
export function joinPaths(...segments: (string | undefined | null)[]): string {
  return segments
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('/')
}

/**
 * Safely parses a numeric sort order, returning undefined for invalid values.
 */
export function parseSortOrder(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return undefined
}
```

Update code to use the safer utilities:

```typescript
// Before (unsafe)
const folderName = folder.folderPath.split("/").pop() ?? "folder"

// After (safe)
import { getLastPathSegment } from '../utils/path-utils'

const folderName = getLastPathSegment(folder.folderPath) ?? 'folder'
if (!folderName) {
  console.warn('Unexpected empty folder path:', folder)
  return // or handle the error appropriately
}
```

Add exhaustive null checks in critical paths:

```typescript
// hooks/use-document-actions.ts

const createDocument = useCallback(
  async (folderPath?: string) => {
    const payload: { title: string; folderPath?: string } = { title: 'untitled' }
    if (folderPath !== undefined && folderPath.length > 0) {
      payload.folderPath = folderPath
    }

    const document = await createMarkdownDocument(payload)

    // Explicit null checks with error handling
    if (!document) {
      throw new Error('Server returned empty response')
    }

    if (typeof document.id !== 'string' || document.id.length === 0) {
      throw new Error('Server returned document without valid ID')
    }

    if (typeof document.documentPath !== 'string') {
      throw new Error('Server returned document without valid path')
    }

    // Now TypeScript knows these are defined
    const slug = document.slug ?? document.id
    const parentPath = getParentPath(document.documentPath)

    await deps.invalidateData()

    if (parentPath) {
      deps.openFolderPath(parentPath)
    }

    deps.navigateToSlug(slug)

    const label = document.title ?? slug
    toast.success(`Created ${label}`)
  },
  [deps]
)
```

Handle optional sortOrder properly in comparisons:

```typescript
// tree/tree-utils.ts

export function sortTree(elements: SidebarTreeElement[]): SidebarTreeElement[] {
  elements.sort((a, b) => {
    const aOrder = a.sortOrder
    const bOrder = b.sortOrder

    // Both have sort orders - compare numerically
    if (typeof aOrder === 'number' && typeof bOrder === 'number') {
      if (aOrder !== bOrder) {
        return aOrder - bOrder
      }
    }

    // One has sort order, other doesn't - sorted items come first
    if (typeof aOrder === 'number' && typeof bOrder !== 'number') {
      return -1
    }
    if (typeof aOrder !== 'number' && typeof bOrder === 'number') {
      return 1
    }

    // Neither has sort order - fall back to alphabetical
    return a.name.localeCompare(b.name)
  })

  // Recursively sort children
  for (const element of elements) {
    if (element.children && element.children.length > 0) {
      sortTree(element.children)
    }
  }

  return elements
}
```

Enable stricter TypeScript settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

With `noUncheckedIndexedAccess` enabled, array indexing returns `T | undefined`, forcing explicit checks:

```typescript
// Before (assumes array[0] exists)
const firstItem = items[0]
console.log(firstItem.name) // Could crash if array is empty

// After (must handle undefined)
const firstItem = items[0]
if (!firstItem) {
  return // Handle empty array case
}
console.log(firstItem.name) // Safe - TypeScript knows it's defined
```

### Benefits

Catches null/undefined errors at compile time, forces explicit handling of edge cases, makes the code more robust against unexpected API responses, improves code documentation since types explicitly show what can be missing, and enables stricter TypeScript settings project-wide.

---

## Summary

These ten improvements address different aspects of code quality:

1. **Extract `handleDragEnd`** - Improves maintainability and testability of complex logic
2. **Consolidate tree traversal** - Reduces duplication and ensures consistent behavior
3. **Type-safe drag data** - Catches errors at compile time and improves IDE support
4. **Use `useReducer`** - Makes state transitions atomic and predictable
5. **Add retry logic and error boundaries** - Improves reliability and user experience
6. **Proper memoization** - Optimizes performance and reduces unnecessary re-renders
7. **Extract focused hooks** - Improves organization, testability, and reusability
8. **Abort controller cleanup** - Prevents memory leaks and race conditions
9. **Constants for magic numbers** - Improves discoverability and maintainability
10. **Strict null checks** - Prevents runtime errors and improves type safety

Each improvement can be implemented independently, though some have dependencies (for example, extracting hooks makes it easier to add proper abort handling to each hook).

For Junior Developer:

Start with #9 (Constants) - Easy win, learn codebase structure
Then #4 (useReducer) - Learn reducer pattern in isolated context
Then #3 (Type-safe drag data) - Level up TypeScript skills

For Mid-Level Developer:

#6 (Memoization) - Performance optimization with measurable impact
#8 (Abort Controllers) - Important cleanup patterns
#10 (Strict Null Checks) - If they're strong with TypeScript

For Senior Developer:

#7 (Extract Hooks) - Highest impact, enables future improvements
#2 (Tree Traversal) - Foundation for cleaner code
#1 (Extract handleDragEnd) - Most complex, most risky
#5 (Error Handling) - Production reliability