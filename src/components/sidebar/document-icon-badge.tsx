"use client"

import { File as FileIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { getItemIconSwatchClass } from "@/lib/icon-colors"

type DocumentIconBadgeProps = {
  iconColor?: string | null | undefined
  className?: string
}

const DOCUMENT_ICON_CLASS = "relative inline-flex size-3.5 shrink-0 items-center justify-center"

export function DocumentIconBadge({ iconColor, className }: DocumentIconBadgeProps) {
  const swatchClass = getItemIconSwatchClass(iconColor)

  return (
    <span className={cn(DOCUMENT_ICON_CLASS, className)} aria-hidden>
      {swatchClass ? (
        <span className={cn("absolute size-6 rounded-full", swatchClass)} />
      ) : null}
      <FileIcon
        className={cn(
          "relative z-10 size-3.5",
          swatchClass ? "text-foreground" : "text-muted-foreground"
        )}
      />
    </span>
  )
}
