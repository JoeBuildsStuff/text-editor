"use client"

import { useMemo, useRef, useCallback, type ReactNode } from "react"
// import { useMemo, useRef, useCallback, useState, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDndContext,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragCancelEvent,
  type Sensors,
  defaultDropAnimationSideEffects,
  type DropAnimationFunction,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ChevronRight, File as FileIcon, Folder as FolderIcon, FolderOpenIcon, Pencil, Trash } from "lucide-react"
import { CSS } from "@dnd-kit/utilities"

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem } from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SIDEBAR_TREE_ROOT_DROPPABLE_ID, type SidebarTreeElement } from "./tree-types"

export type SidebarTreeProps = {
  elements: SidebarTreeElement[]
  selectedSlug?: string
  openFolders: Set<string>
  onToggleFolder: (folderId: string) => void
  isActionPending: boolean
  onCreateDocument: (folderPath?: string) => void
  onCreateFolder: (folderPath?: string) => void
  onDeleteFolder: (folderPath: string) => void
  onDeleteDocument: (documentId: string, slug?: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onRenameDocument: (documentId: string, currentName: string) => void
  onSelect: (slug: string) => void
  sensors: Sensors
  collisionDetection: CollisionDetection
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragCancel?: (event: DragCancelEvent) => void
  activeDragLabel?: string | null
}

type TreeRenderOptions = {
  onSelect: (slug: string) => void
  selectedSlug?: string
  openFolders: Set<string>
  onToggleFolder: (folderId: string) => void
  isActionPending: boolean
  onCreateDocument: (folderPath?: string) => void
  onCreateFolder: (folderPath?: string) => void
  onDeleteFolder: (folderPath: string) => void
  onDeleteDocument: (documentId: string, slug?: string) => void
  onRenameFolder: (folderPath: string, currentName: string) => void
  onRenameDocument: (documentId: string, currentName: string) => void
  isNested?: boolean
}

// type SourceGhostState = {
//   rect: { top: number; left: number; width: number; height: number }
//   label: string
//   kind: "folder" | "document"
// }

export function SidebarTree({
  elements,
  selectedSlug,
  openFolders,
  onToggleFolder,
  isActionPending,
  onCreateDocument,
  onCreateFolder,
  onDeleteFolder,
  onDeleteDocument,
  onRenameFolder,
  onRenameDocument,
  onSelect,
  sensors,
  collisionDetection,
  onDragStart,
  onDragEnd,
  onDragCancel,
  activeDragLabel,
}: SidebarTreeProps) {
  const dropTargetRectRef = useRef<DOMRect | null>(null)
  // const [sourceGhost, setSourceGhost] = useState<SourceGhostState | null>(null)

  const applyDropSideEffects = useMemo(
    () =>
      defaultDropAnimationSideEffects({
        styles: {
          active: {
            opacity: "0",
          },
        },
      }),
    []
  )

  const dropAnimation = useCallback<DropAnimationFunction>(
    ({ active, dragOverlay, transform }) => {
      const targetRect = dropTargetRectRef.current ?? active.rect
      dropTargetRectRef.current = null

      if (!targetRect) {
        // setSourceGhost(null)
        return
      }

      const translateX = dragOverlay.rect.left - targetRect.left
      const translateY = dragOverlay.rect.top - targetRect.top
      const finalTransform = {
        x: transform.x - translateX,
        y: transform.y - translateY,
        scaleX: 1,
        scaleY: 1,
      }

      const keyframes = [
        { transform: CSS.Transform.toString(transform) },
        { transform: CSS.Transform.toString(finalTransform) },
      ]

      const cleanup = applyDropSideEffects?.({ active, dragOverlay })
      const animation = dragOverlay.node.animate(keyframes, {
        duration: 220,
        easing: "ease-out",
        fill: "forwards",
      })

      return new Promise<void>((resolve) => {
        const handleAnimationComplete = () => {
          cleanup?.()
          // setSourceGhost(null)
          resolve()
        }

        animation.onfinish = handleAnimationComplete
        animation.oncancel = handleAnimationComplete
      })
    },
    [applyDropSideEffects]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      dropTargetRectRef.current = null
      // const data = event.active.data.current
      // const activeRect =
      //   event.active.rect.current.initial ?? event.active.rect.current.translated ?? null

      // if (data && activeRect && (data.type === "folder" || data.type === "document")) {
      //   setSourceGhost({
      //     rect: {
      //       top: activeRect.top,
      //       left: activeRect.left,
      //       width: activeRect.width,
      //       height: activeRect.height,
      //     },
      //     label: data.label ?? (data.type === "folder" ? "Folder" : "Document"),
      //     kind: data.type,
      //   })
      // }

      onDragStart?.(event)
    },
    [onDragStart]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.over) {
        dropTargetRectRef.current = calculateDropTargetRect(event) ?? dropTargetRectRef.current
      } else {
        dropTargetRectRef.current = null
        // setSourceGhost(null)
      }
      onDragEnd?.(event)
    },
    [onDragEnd]
  )

  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      dropTargetRectRef.current = null
      // setSourceGhost(null)
      onDragCancel?.(event)
    },
    [onDragCancel]
  )

  const options: TreeRenderOptions = {
    onSelect,
    selectedSlug,
    openFolders,
    onToggleFolder,
    isActionPending,
    onCreateDocument,
    onCreateFolder,
    onDeleteFolder,
    onDeleteDocument,
    onRenameFolder,
    onRenameDocument,
  }

  if (!elements.length) {
    return null
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <RootDropZone>
        <SidebarMenu>
          <SidebarTreeNodes elements={elements} options={options} />
        </SidebarMenu>
      </RootDropZone>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDragLabel ? (
          <div className="flex items-center rounded-md bg-muted px-3 py-1.5 text-sm ring-1 ring-foreground">
            <FileIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
            <span className="font-normal">{activeDragLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
      {/* {sourceGhost ? <SourceGhostOverlay ghost={sourceGhost} /> : null} */}
    </DndContext>
  )
}

function SidebarTreeNodes({
  elements,
  options,
}: {
  elements: SidebarTreeElement[]
  options: TreeRenderOptions
}) {
  const { active } = useDndContext()
  const items = useMemo(() => elements.map((e) => e.id), [elements])
  const activeIndex = elements.findIndex((e) => e.id === active?.id)

  if (!elements.length) return null

  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {elements.map((element, index) =>
        element.kind === "folder" ? (
          <FolderTreeNode
            key={element.id}
            element={element}
            options={options}
            index={index}
            activeIndex={activeIndex}
          />
        ) : (
          <DocumentTreeNode
            key={element.id}
            element={element}
            options={options}
            index={index}
            activeIndex={activeIndex}
          />
        )
      )}
    </SortableContext>
  )
}

function FolderTreeNode({
  element,
  options,
  index,
  activeIndex,
}: {
  element: SidebarTreeElement
  options: TreeRenderOptions
  index: number
  activeIndex: number
}) {
  const isOpen = options.openFolders.has(element.id)
  const folderPath =
    element.folderPath && element.folderPath.length > 0 ? element.folderPath : undefined

  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${element.id}`,
    data: {
      type: "folder" as const,
      folderPath,
    },
  })

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transition,
    // isDragging,
  } = useSortable({
    id: element.id,
    data: {
      type: "folder",
      folderPath,
      sortOrder: element.sortOrder,
      label: element.name,
    },
  })

  const { active, over } = useDndContext()
  const isOverContext = over?.id === element.id
  const isDraggingSelf = active?.id === element.id
  const isOverParent = over?.id === SIDEBAR_TREE_ROOT_DROPPABLE_ID || over?.id === `folder:${element.folderPath}`

  let dropPosition: "top" | "bottom" | "middle" | null = null

  // When dragging this item, calculate drop position based on cursor relative to adjacent siblings
  // or parent container to show indicator at original position
  if (isDraggingSelf && active && (isOverParent || isOverContext)) {
    const activeRect = active.rect.current.translated
    if (activeRect && over?.rect) {
      const overRect = over.rect
      const activeCenterY = activeRect.top + activeRect.height / 2
      const overTop = overRect.top
      const overHeight = overRect.height || 40 // fallback height if 0
      const relativeY = overHeight > 0 ? (activeCenterY - overTop) / overHeight : 0.5

      if (relativeY < 0.33) {
        dropPosition = "top"
      } else if (relativeY > 0.67) {
        dropPosition = "bottom"
      } else {
        dropPosition = "middle"
      }
    } else if (activeRect) {
      // Fallback: use index-based logic when rects aren't available
      if (activeIndex === -1) dropPosition = "middle"
      else if (activeIndex < index) dropPosition = "bottom"
      else dropPosition = "top"
    }
  } else if (isOverContext && active && over) {
    const activeRect = active.rect.current.translated
    const overRect = over.rect

    if (activeRect && overRect) {
      const activeCenterY = activeRect.top + activeRect.height / 2
      const overTop = overRect.top
      const overHeight = overRect.height
      const relativeY = (activeCenterY - overTop) / overHeight

      if (relativeY < 0.25) {
        dropPosition = "top"
      } else if (relativeY > 0.75) {
        dropPosition = "bottom"
      } else {
        dropPosition = "middle"
      }
    } else {
      if (activeIndex === -1) dropPosition = "middle"
      else if (activeIndex < index) dropPosition = "bottom"
      else dropPosition = "top"
    }
  }

  const style = {
    transform: undefined,
    transition,
  }

  return (
    <ContextMenu>
      <div
        ref={setSortableRef}
        style={style}
        className={cn(
          "rounded-sm relative",
          dropPosition === "middle" && "bg-muted/40",
          // Always fully collapse when dragging self - indicator will appear on adjacent items
          isDraggingSelf && "opacity-0 pointer-events-none h-0 overflow-hidden"
        )}
      >
        {/* Don't show indicator on the item being dragged itself - only on other items */}
        {dropPosition === "top" && !isDraggingSelf && <DropGapIndicator />}
        <div ref={setNodeRef}>
          <Collapsible
            open={isOpen}
            onOpenChange={() => options.onToggleFolder(element.id)}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <ContextMenuTrigger asChild>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      options.isNested && "mr-0!",
                      isOver && "bg-muted/60"
                    )}
                    {...attributes}
                    {...listeners}
                  >
                    {isOpen ? (
                      <FolderOpenIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                    ) : (
                      <FolderIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                    )}
                    <span className="font-normal">{element.name}</span>
                    <ChevronRight
                      className={cn(
                        "ml-auto transition-transform w-3.5 h-3.5 text-muted-foreground",
                        isOpen && "rotate-90"
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
              </ContextMenuTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mr-0! pr-0!">
                  <SidebarMenuSubItem>
                    <SidebarTreeNodes
                      elements={element.children ?? []}
                      options={{ ...options, isNested: true }}
                    />
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </div>
        {/* Don't show indicator on the item being dragged itself - only on other items */}
        {dropPosition === "bottom" && !isDraggingSelf && <DropGapIndicator />}
      </div>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => options.onCreateDocument(folderPath)}
        >
          <FileIcon className="size-4" />
          Add Document
        </ContextMenuItem>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => options.onCreateFolder(folderPath)}
        >
          <FolderIcon className="size-4" />
          Add Folder
        </ContextMenuItem>
        {folderPath && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={options.isActionPending}
              onSelect={() => options.onRenameFolder(folderPath, element.name)}
            >
              <Pencil className="size-4" />
              Rename Folder
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={options.isActionPending}
              onSelect={() => options.onDeleteFolder(folderPath)}
            >
              <Trash className="size-4" />
              Delete Folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DocumentTreeNode({
  element,
  options,
  index,
  activeIndex,
}: {
  element: SidebarTreeElement
  options: TreeRenderOptions
  index: number
  activeIndex: number
}) {
  const folderSegments = element.documentPath?.split("/") ?? []
  folderSegments.pop()
  const currentFolderPath = folderSegments.join("/") || undefined

  const {
    attributes,
    listeners,
    setNodeRef,
    transition,
    // isDragging,
  } = useSortable({
    id: element.id,
    data: {
      type: "document",
      documentId: element.documentId,
      slug: element.id,
      currentFolderPath,
      label: element.name,
      sortOrder: element.sortOrder,
    },
  })

  const { active, over } = useDndContext()
  const isOver = over?.id === element.id
  const isDraggingSelf = active?.id === element.id
  // Check if over parent folder or root
  const isOverParent = over?.data.current?.type === "folder" && 
    (over?.data.current?.folderPath === currentFolderPath || 
     (!over?.data.current?.folderPath && !currentFolderPath))

  let dropPosition: "top" | "bottom" | null = null

  // When dragging this document, calculate drop position to show indicator at original position
  // Check if hovering over parent or original position
  if (isDraggingSelf && active && (isOver || isOverParent)) {
    const activeRect = active.rect.current.translated
    if (activeRect && over?.rect) {
      const overRect = over.rect
      const activeCenterY = activeRect.top + activeRect.height / 2
      const overTop = overRect.top
      const overHeight = overRect.height || 40 // fallback height if 0
      const relativeY = overHeight > 0 ? (activeCenterY - overTop) / overHeight : 0.5

      if (relativeY < 0.5) {
        dropPosition = "top"
      } else {
        dropPosition = "bottom"
      }
    } else {
      // Fallback logic when dragging self
      if (activeIndex === -1) {
        dropPosition = "bottom"
      } else if (activeIndex < index) {
        dropPosition = "bottom"
      } else {
        dropPosition = "top"
      }
    }
  } else if (isOver) {
    if (activeIndex === -1) {
      dropPosition = "bottom"
    } else if (activeIndex < index) {
      dropPosition = "bottom"
    } else {
      dropPosition = "top"
    }
  }

  const dragStyle = {
    transform: undefined,
    transition,
  }

  // const hiddenWhileDragging = cn("transition-opacity", isDragging && "opacity-25")
  const hiddenWhileDragging = cn(
    "transition-opacity",
    // Always fully collapse when dragging self - indicator will appear on adjacent items
    isDraggingSelf && "opacity-0 pointer-events-none h-0 overflow-hidden"
  )
  const isSelected = options.selectedSlug === element.id

  const fileButton = (
    <SidebarMenuButton
      onClick={() => options.onSelect(element.id)}
      className={cn(
        "w-full justify-start",
        options.isNested && "mr-0!",
        isSelected ? "bg-muted/50 hover:bg-muted font-semibold" : "hover:bg-muted"
      )}
      {...attributes}
      {...listeners}
    >
      <FileIcon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
      <span className="font-normal">{element.name}</span>
    </SidebarMenuButton>
  )

  const menuContent = (
    <>
      <ContextMenuTrigger asChild>{fileButton}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={options.isActionPending}
          onSelect={() => {
            if (element.documentId) {
              options.onRenameDocument(element.documentId, element.name)
            }
          }}
        >
          <Pencil className="size-4" />
          Rename Document
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={options.isActionPending}
          onSelect={() => {
            if (element.documentId) {
              options.onDeleteDocument(element.documentId, element.id)
            }
          }}
        >
          <Trash className="size-4" />
          Delete Document
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  )

  const draggableContent = (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        "relative",
        // Always fully collapse when dragging self - indicator will appear on adjacent items
        isDraggingSelf && "h-0 overflow-hidden"
      )}
    >
      {/* Don't show indicator on the item being dragged itself - only on other items */}
      {dropPosition === "top" && !isDraggingSelf && <DropGapIndicator />}
      <div className={hiddenWhileDragging}>{menuContent}</div>
      {dropPosition === "bottom" && !isDraggingSelf && <DropGapIndicator />}
    </div>
  )

  if (options.isNested) {
    return <ContextMenu>{draggableContent}</ContextMenu>
  }

  return (
    <SidebarMenuItem>
      <ContextMenu>{draggableContent}</ContextMenu>
    </SidebarMenuItem>
  )
}

function DropGapIndicator() {
  const { active } = useDndContext()
  const activeData = active?.data.current as { type?: string; label?: string } | undefined

  const label = activeData?.label ?? "Placeholder"
  const isFolder = activeData?.type === "folder"
  const Icon = isFolder ? FolderIcon : FileIcon

  return (
    <div className="px-3 py-2">
      <div className="flex items-center rounded-md border border-dashed border-primary/40 bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
        <Icon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
}

// function SourceGhostOverlay({ ghost }: { ghost: SourceGhostState }) {
//   const Icon = ghost.kind === "folder" ? FolderIcon : FileIcon
//
//   return (
//     <div
//       className="pointer-events-none fixed z-[998]"
//       style={{
//         top: ghost.rect.top,
//         left: ghost.rect.left,
//         width: ghost.rect.width,
//         height: ghost.rect.height,
//       }}
//     >
//       <div className="flex h-full items-center rounded-md border border-dashed border-muted-foreground/40 bg-muted/70 px-2 py-1 text-sm text-muted-foreground">
//         <Icon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
//         <span className="truncate">{ghost.label}</span>
//       </div>
//     </div>
//   )
// }

function RootDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: SIDEBAR_TREE_ROOT_DROPPABLE_ID,
    data: {
      type: "folder" as const,
      folderPath: undefined,
    },
  })

  return (
    <div ref={setNodeRef} className={cn("rounded-md transition-colors", isOver && "bg-muted/30")}>
      {children}
    </div>
  )
}

function calculateDropTargetRect(event: DragEndEvent): DOMRect | null {
  const { active, over } = event
  if (!over?.rect) {
    return null
  }

  const overRect = over.rect
  const activeRect =
    active.rect.current.translated ??
    active.rect.current.initial ??
    new DOMRect(overRect.left, overRect.top, overRect.width, overRect.height)

  const centerY = activeRect.top + activeRect.height / 2
  const overHeight = overRect.height || 1
  const relativeY = (centerY - overRect.top) / overHeight
  const isFolder = over.data.current?.type === "folder"

  if (isFolder && relativeY >= 0.25 && relativeY <= 0.75) {
    return new DOMRect(overRect.left, overRect.top, overRect.width, overRect.height)
  }

  const height = activeRect.height || overRect.height
  const targetTop = relativeY < (isFolder ? 0.25 : 0.5) ? overRect.top : overRect.bottom - height

  return new DOMRect(overRect.left, targetTop, overRect.width, height)
}
