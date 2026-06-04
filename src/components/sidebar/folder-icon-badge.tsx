"use client"

import { Folder as FolderIcon, FolderOpen as FolderOpenIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { getItemIconSwatchClass } from "@/lib/icon-colors"

type FolderIconBadgeProps = {
  iconColor?: string | null | undefined
  isOpen?: boolean
  className?: string
}

const FOLDER_ICON_CLASS = "relative inline-flex size-3.5 shrink-0 items-center justify-center"

export function FolderIconBadge({ iconColor, isOpen = false, className }: FolderIconBadgeProps) {
  const swatchClass = getItemIconSwatchClass(iconColor)
  const Icon = isOpen ? FolderOpenIcon : FolderIcon

  return (
    <span className={cn(FOLDER_ICON_CLASS, className)} aria-hidden>
      {swatchClass ? (
        <span className={cn("absolute size-6 rounded-full", swatchClass)} />
      ) : null}
      <Icon className={cn("relative z-10 size-3.5", swatchClass ? "text-foreground" : "text-muted-foreground")} />
    </span>
  )
}
