"use client"

import { useMemo, type ReactNode } from "react"
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
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ChevronRight, File as FileIcon, Folder as FolderIcon, FolderOpenIcon, Pencil, Trash } from "lucide-react"

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
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <RootDropZone>
        <SidebarMenu>
          <SidebarTreeNodes elements={elements} options={options} />
        </SidebarMenu>
      </RootDropZone>
      <DragOverlay>
        {activeDragLabel ? (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm ring-1 ring-foreground">
            <FileIcon className="size-4 text-muted-foreground" />
            <span>{activeDragLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
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
    isDragging,
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

  let dropPosition: "top" | "bottom" | "middle" | null = null

  if (isOverContext && !isDraggingSelf && active && over) {
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
          isDragging && "opacity-25"
        )}
      >
        {dropPosition === "top" && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
        )}
        {dropPosition === "bottom" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10" />
        )}
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
    isDragging,
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

  let dropPosition: "top" | "bottom" | null = null

  if (isOver && !isDraggingSelf) {
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

  const hiddenWhileDragging = cn("transition-opacity", isDragging && "opacity-25")
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
    <div ref={setNodeRef} style={dragStyle} className="relative">
      <div className={hiddenWhileDragging}>{menuContent}</div>
      {dropPosition === "top" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
      )}
      {dropPosition === "bottom" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10" />
      )}
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
