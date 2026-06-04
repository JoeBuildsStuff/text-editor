"use client"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FolderFormFields } from "@/components/sidebar/folder-form-fields"
import type { CreateFolderDialogState } from "@/components/sidebar/hooks/use-create-folder-dialog"
import type { ItemIconColorId } from "@/lib/icon-colors"

export type CreateFolderDialogProps = {
  state: CreateFolderDialogState
  isPending: boolean
  canSubmit: boolean
  onNameChange: (name: string) => void
  onIconColorChange: (iconColor: ItemIconColorId | null) => void
  onDescriptionChange: (description: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function CreateFolderDialog({
  state,
  isPending,
  canSubmit,
  onNameChange,
  onIconColorChange,
  onDescriptionChange,
  onSubmit,
  onClose,
}: CreateFolderDialogProps) {
  if (state.status === "closed") {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new folder</DialogTitle>
        </DialogHeader>

        <FolderFormFields
          nameInputId="create-folder-name"
          name={state.name}
          iconColor={state.iconColor}
          description={state.description}
          descriptionInputId="create-folder-description"
          onNameChange={onNameChange}
          onIconColorChange={onIconColorChange}
          onDescriptionChange={onDescriptionChange}
          onSubmit={onSubmit}
          canSubmit={canSubmit}
          onClose={onClose}
          autoFocusName
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending || !canSubmit}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
