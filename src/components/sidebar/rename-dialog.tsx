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
import { DocumentFormFields } from "@/components/sidebar/document-form-fields"
import type { RenameDialogState } from "@/components/sidebar/hooks/rename-dialog-reducer"
import { folderRenameHasChanges } from "@/components/sidebar/hooks/rename-dialog-reducer"
import type { ItemIconColorId } from "@/lib/icon-colors"

export type RenameDialogProps = {
  state: RenameDialogState
  isPending: boolean
  canSubmit: boolean
  onNewNameChange: (value: string) => void
  onIconColorChange: (iconColor: ItemIconColorId | null) => void
  onDescriptionChange: (description: string) => void
  onSubmit: () => void
  onClose: () => void
}

export function RenameDialog({
  state,
  isPending,
  canSubmit,
  onNewNameChange,
  onIconColorChange,
  onDescriptionChange,
  onSubmit,
  onClose,
}: RenameDialogProps) {
  if (state.status === "closed") return null

  if (state.entityType === "folder") {
    const folderCanSubmit = canSubmit && folderRenameHasChanges(state)

    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit folder</DialogTitle>
          </DialogHeader>

          <FolderFormFields
            nameInputId="rename-folder-name"
            name={state.newName}
            iconColor={state.iconColor}
            description={state.description}
            descriptionInputId="rename-folder-description"
            onNameChange={onNewNameChange}
            onIconColorChange={onIconColorChange}
            onDescriptionChange={onDescriptionChange}
            onSubmit={onSubmit}
            canSubmit={folderCanSubmit}
            onClose={onClose}
            autoFocusName
          />

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={isPending || !folderCanSubmit}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const documentCanSubmit = canSubmit

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>

        <DocumentFormFields
          nameInputId="rename-document-name"
          name={state.newName}
          iconColor={state.iconColor}
          onNameChange={onNewNameChange}
          onIconColorChange={onIconColorChange}
          onSubmit={onSubmit}
          canSubmit={documentCanSubmit}
          onClose={onClose}
          autoFocusName
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending || !documentCanSubmit}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
