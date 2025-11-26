import { useCallback, useState } from "react"
import {
  PointerSensor,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"

import { DND_ACTIVATION_DISTANCE } from "@/components/sidebar/constants"
import { resolveDropScenario } from "@/components/sidebar/hooks/resolve-drop-scenario"
import type { DropScenario } from "@/components/sidebar/hooks/drag-end-types"
import {
  SIDEBAR_TREE_ROOT_DROPPABLE_ID,
  isDragData,
  type SidebarTreeElement,
} from "@/components/sidebar/tree/tree-types"

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
      activationConstraint: { distance: DND_ACTIVATION_DISTANCE },
    })
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const collisions = closestCenter(args)
    if (collisions.length <= 1) {
      return collisions
    }
    const nonRoot = collisions.filter((collision) => collision.id !== SIDEBAR_TREE_ROOT_DROPPABLE_ID)
    return nonRoot.length ? nonRoot : collisions
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current
    if (isDragData(data)) {
      setActiveDragLabel(data.label)
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
