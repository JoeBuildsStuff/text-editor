"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type RenameDialogProps = {
  open: boolean
  isPending: boolean
  type: "folder" | "document"
  currentName: string
  newName: string
  onNewNameChange: (value: string) => void
  onSubmit: () => void
  onOpenChange: (open: boolean) => void
}

export function RenameDialog({
  open,
  isPending,
  type,
  currentName,
  newName,
  onNewNameChange,
  onSubmit,
  onOpenChange,
}: RenameDialogProps) {
  const nameLabel = type === "folder" ? "Folder" : "Document"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {nameLabel}</DialogTitle>
          <DialogDescription>
            Enter a new name for the {nameLabel.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSubmit()
              } else if (event.key === "Escape") {
                onOpenChange(false)
              }
            }}
            placeholder={`Enter ${nameLabel.toLowerCase()} name`}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              isPending ||
              !newName.trim() ||
              newName.trim() === currentName
            }
          >
            {isPending ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
