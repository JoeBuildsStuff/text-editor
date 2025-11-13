import Link from "next/link"
import { redirect } from "next/navigation"
import { File as FileIcon, Folder as FolderIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { EmptyDocumentsState } from "@/components/documents/empty-documents-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getServerSession } from "@/lib/auth/session"
import { listMarkdownItems } from "@/lib/markdown-files"

export default async function DocumentsPage() {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in")
  }

  const { documents, folders } = await listMarkdownItems({ includeContent: false })

  const hasContent = documents.length > 0 || folders.length > 0

  if (!hasContent) {
    return <EmptyDocumentsState />
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-1">
            {documents.length} {documents.length === 1 ? "document" : "documents"}
            {folders.length > 0 && ` • ${folders.length} ${folders.length === 1 ? "folder" : "folders"}`}
          </p>
        </div>
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">All Documents</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Link key={doc.id} href={`/documents/${doc.slug}`}>
                <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <FileIcon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="line-clamp-2 text-base">{doc.title}</CardTitle>
                        <CardDescription className="text-xs mt-1 line-clamp-1">
                          {doc.documentPath}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {folders.length > 0 && documents.length === 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Folders</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Card key={folder.id} className="h-full">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <FolderIcon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="line-clamp-2 text-base">
                        {folder.folderPath.split("/").pop() || folder.folderPath}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 line-clamp-1">
                        {folder.folderPath}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(folder.createdAt), { addSuffix: true })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}