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
import type { RenameDialogState } from "@/components/sidebar/hooks/rename-dialog-reducer"

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
  if (state.status === 'closed') return null

  const nameLabel = state.entityType === "folder" ? "Folder" : "Document"
  const canSubmit = state.newName.trim().length > 0 && state.newName.trim() !== state.currentName

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
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
              if (event.key === "Enter" && canSubmit) {
                onSubmit()
              } else if (event.key === "Escape") {
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
            {isPending ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
