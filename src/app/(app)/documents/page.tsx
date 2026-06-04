import Link from "next/link"
import { redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { File as FileIcon, FilePlusCorner, Folder as FolderIcon } from "lucide-react"

import { EmptyDocumentsState } from "@/components/documents/empty-documents-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatDocumentIdBadge } from "@/lib/document-id-badge"
import { getServerSession } from "@/lib/auth/session"
import { listMarkdownItems, type MarkdownFileMeta } from "@/lib/markdown-files"
import { createDocumentAction } from "./actions"
import {
  DocumentsSortDropdown,
  type DocumentsSortKey,
} from "./documents-sort-dropdown"

type DocumentsPageProps = {
  searchParams?: Promise<{
    sort?: string | string[]
    order?: string | string[]
  }>
}

function sortDocuments(
  documents: MarkdownFileMeta[],
  sortBy: DocumentsSortKey,
  sortOrder: "asc" | "desc"
) {
  const direction = sortOrder === "asc" ? 1 : -1

  return [...documents].sort((a, b) => {
    const aTime = new Date(sortBy === "created" ? a.createdAt : a.updatedAt).getTime()
    const bTime = new Date(sortBy === "created" ? b.createdAt : b.updatedAt).getTime()
    return (aTime - bTime) * direction
  })
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

  const resolvedSearchParams = searchParams ? await searchParams : {}
  const sortParam = Array.isArray(resolvedSearchParams.sort)
    ? resolvedSearchParams.sort[0]
    : resolvedSearchParams.sort
  const orderParam = Array.isArray(resolvedSearchParams.order)
    ? resolvedSearchParams.order[0]
    : resolvedSearchParams.order
  const sortBy: DocumentsSortKey =
    sortParam === "created" || sortParam === "modified" ? sortParam : "modified"
  const sortOrder: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc"

  const { documents, folders } = await listMarkdownItems({
    includeContent: false,
    userId: session.user.id,
  })

  const hasContent = documents.length > 0 || folders.length > 0

  if (!hasContent) {
    return <EmptyDocumentsState />
  }

  const sortedDocuments = sortDocuments(documents, sortBy, sortOrder)
  const foldersOnly = sortedDocuments.length === 0 && folders.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Create and open your documents.
          </p>
        </div>

        <form id="create-document-form" action={createDocumentAction} />
        <ButtonGroup>
          <Button
            type="submit"
            variant="outline"
            form="create-document-form"
            size="sm"
          >
            <FilePlusCorner className="size-4 text-muted-foreground" /> New
          </Button>
          <DocumentsSortDropdown value={sortBy} order={sortOrder} />
        </ButtonGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {sortedDocuments.length > 0 ? (
          sortedDocuments.map((doc) => {
            const badgeText = formatDocumentIdBadge(doc.id)
            const sortTimestamp = sortBy === "created" ? doc.createdAt : doc.updatedAt
            const sortLabel = sortBy === "created" ? "Created" : "Last updated"

            return (
              <Card
                key={doc.id}
                className="cursor-pointer border-none p-2 hover:bg-secondary/50"
              >
                <Link href={`/documents/${doc.slug}`}>
                  <CardHeader className="p-0">
                    <CardTitle className="flex items-center gap-2">
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.title || "Untitled"}</span>
                    </CardTitle>
                    <CardDescription>
                      {badgeText ? (
                        <Badge className="text-muted-foreground" variant="secondary">
                          {badgeText}
                        </Badge>
                      ) : null}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {sortLabel}{" "}
                        {formatDistanceToNow(new Date(sortTimestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Link>
              </Card>
            )
          })
        ) : foldersOnly ? (
          folders.map((folder) => {
            const badgeText = formatDocumentIdBadge(folder.id)
            const sortTimestamp =
              sortBy === "created" ? folder.createdAt : folder.updatedAt
            const sortLabel = sortBy === "created" ? "Created" : "Last updated"
            const folderName =
              folder.folderPath.split("/").pop() || folder.folderPath

            return (
              <Card
                key={folder.id}
                className="cursor-default border-none p-2 hover:bg-secondary/50"
              >
                <CardHeader className="p-0">
                  <CardTitle className="flex items-center gap-2">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folderName}</span>
                  </CardTitle>
                  <CardDescription>
                    {badgeText ? (
                      <Badge className="text-muted-foreground" variant="secondary">
                        {badgeText}
                      </Badge>
                    ) : null}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {sortLabel}{" "}
                      {formatDistanceToNow(new Date(sortTimestamp), {
                        addSuffix: true,
                      })}
                    </span>
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          })
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-8 text-sm text-muted-foreground">
            You do not have any documents yet.
          </div>
        )}
      </div>
    </div>
  )
}
