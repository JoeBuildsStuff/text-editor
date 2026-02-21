import Link from "next/link"
import { redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { File as FileIcon, Folder as FolderIcon, Terminal, ArrowRight } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getServerSession } from "@/lib/auth/session"
import { listMarkdownItems } from "@/lib/markdown-files"
import { getLastPathSegment } from "@/lib/path-utils"

const RECENT_LIMIT = 6

export default async function HomePage() {
  const session = await getServerSession()
  if (!session) {
    redirect("/sign-in?callbackUrl=/")
  }

  const { documents, folders } = await listMarkdownItems({
    includeContent: false,
    userId: session.user.id,
  })

  const recentDocuments = [...documents]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECENT_LIMIT)

  const topFolders = folders
    .filter((folder) => !folder.folderPath.includes("/"))
    .slice(0, 5)

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 py-4">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Your markdown editor for structured notes, docs, and executable code blocks.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/documents">
              Open Documents
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/terminal">
              <Terminal className="size-4" />
              Open Terminal
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-3xl">{documents.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Markdown files tracked in your workspace
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Folders</CardDescription>
            <CardTitle className="text-3xl">{folders.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Folder structure for organizing your notes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Last Activity</CardDescription>
            <CardTitle className="text-base">
              {recentDocuments[0]
                ? formatDistanceToNow(new Date(recentDocuments[0].updatedAt), { addSuffix: true })
                : "No activity yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Based on the most recently updated document
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Documents</CardTitle>
            <CardDescription>Jump back into what you were editing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentDocuments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No documents yet. Use the sidebar to create your first document.
              </p>
            )}
            {recentDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.slug}`}
                className="hover:bg-accent flex items-center justify-between rounded-md border p-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileIcon className="size-4 text-muted-foreground" />
                    <span className="truncate">{doc.title}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">{doc.documentPath}</p>
                </div>
                <span className="text-muted-foreground ml-3 shrink-0 text-xs">
                  {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top-Level Folders</CardTitle>
            <CardDescription>Your primary document areas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topFolders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No folders yet. Add one from the sidebar to structure your workspace.
              </p>
            )}
            {topFolders.map((folder) => (
              <div key={folder.id} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <FolderIcon className="size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {getLastPathSegment(folder.folderPath) ?? folder.folderPath}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{folder.folderPath}</p>
                </div>
              </div>
            ))}
            {folders.length > topFolders.length && (
              <Button asChild variant="ghost" className="w-full justify-start">
                <Link href="/documents">View all folders in Documents</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
