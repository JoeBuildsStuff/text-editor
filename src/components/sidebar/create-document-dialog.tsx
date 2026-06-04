"use client"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DocumentFormFields } from "@/components/sidebar/document-form-fields"
import type { CreateDocumentDialogState } from "@/components/sidebar/hooks/use-create-document-dialog"
import type { ItemIconColorId } from "@/lib/icon-colors"

export type CreateDocumentDialogProps = {
  state: CreateDocumentDialogState
  isPending: boolean
  canSubmit: boolean
  onNameChange: (name: string) => void
  onIconColorChange: (iconColor: ItemIconColorId | null) => void
  onSubmit: () => void
  onClose: () => void
}

export function CreateDocumentDialog({
  state,
  isPending,
  canSubmit,
  onNameChange,
  onIconColorChange,
  onSubmit,
  onClose,
}: CreateDocumentDialogProps) {
  if (state.status === "closed") {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new document</DialogTitle>
        </DialogHeader>

        <DocumentFormFields
          nameInputId="create-document-name"
          name={state.name}
          iconColor={state.iconColor}
          onNameChange={onNameChange}
          onIconColorChange={onIconColorChange}
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
