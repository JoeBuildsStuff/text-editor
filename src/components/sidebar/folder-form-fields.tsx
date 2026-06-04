"use client"

import { Ban, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FolderIconBadge } from "@/components/sidebar/folder-icon-badge"
import {
  ITEM_ICON_COLORS,
  type ItemIconColorId,
} from "@/lib/icon-colors"
import { cn } from "@/lib/utils"

type FolderFormFieldsProps = {
  nameInputId?: string
  name: string
  iconColor: ItemIconColorId | null
  description: string
  descriptionInputId?: string
  onNameChange: (name: string) => void
  onIconColorChange: (iconColor: ItemIconColorId | null) => void
  onDescriptionChange: (description: string) => void
  onSubmit?: () => void
  canSubmit?: boolean
  onClose?: () => void
  autoFocusName?: boolean
}

export function FolderFormFields({
  nameInputId = "folder-name",
  name,
  iconColor,
  description,
  descriptionInputId = "folder-description",
  onNameChange,
  onIconColorChange,
  onDescriptionChange,
  onSubmit,
  canSubmit = false,
  onClose,
  autoFocusName = false,
}: FolderFormFieldsProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor={nameInputId} className="text-muted-foreground text-xs font-normal">
          Folder name and icon color
        </Label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="text-muted-foreground shrink-0 gap-1 px-2.5"
                aria-label="Choose folder icon color"
              >
                <FolderIconBadge iconColor={iconColor} />
                <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-9 gap-1.5">
                <button
                  type="button"
                  title="No color"
                  aria-label="No color"
                  onClick={() => onIconColorChange(null)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border transition-colors",
                    iconColor === null
                      ? "border-ring ring-ring/50 ring-2"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <Ban className="text-muted-foreground size-3.5" />
                </button>
                {ITEM_ICON_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    title={color.label}
                    aria-label={color.label}
                    onClick={() => onIconColorChange(color.id)}
                    className={cn(
                      "size-7 rounded-full border-2 border-transparent transition-[box-shadow,transform]",
                      color.swatchClass,
                      iconColor === color.id && "border-foreground/80 ring-ring/50 ring-2"
                    )}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            id={nameInputId}
            className="min-w-0 flex-1"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) {
                onSubmit?.()
              } else if (event.key === "Escape") {
                onClose?.()
              }
            }}
            placeholder="Folder name"
            autoFocus={autoFocusName}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionInputId} className="text-muted-foreground text-xs font-normal">
          Folder description
        </Label>
        <Input
          id={descriptionInputId}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Optional"
        />
      </div>
    </div>
  )
}
