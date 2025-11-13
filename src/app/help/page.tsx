import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileIcon, FolderIcon, ArrowLeftIcon } from "lucide-react"

export default function HelpPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 py-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/documents">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help & Instructions</h1>
          <p className="text-muted-foreground mt-1">
            Learn how to use the text editor and manage your documents!!
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileIcon className="size-5" />
              Creating Documents
            </CardTitle>
            <CardDescription>
              Learn how to create and manage your markdown documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Create a New Document</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Click the &quot;New Document&quot; button in the sidebar</li>
                <li>Or use the &quot;Create Document&quot; button on the empty state page</li>
                <li>Right-click any folder in the sidebar and select &quot;Add Document&quot;</li>
                <li>Use the dropdown menu (⋯) next to the Documents label in the sidebar</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Edit Document Title</h3>
              <p className="text-sm text-muted-foreground">
                Click on the document title at the top of the editor to rename it. The title is
                stored separately from the filename, allowing you to use user-friendly names.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Delete a Document</h3>
              <p className="text-sm text-muted-foreground">
                Right-click any document in the sidebar and select &quot;Delete Document&quot; to
                remove it permanently.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderIcon className="size-5" />
              Organizing with Folders
            </CardTitle>
            <CardDescription>
              Create folders to organize your documents hierarchically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Create a Folder</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Click the &quot;Create Folder&quot; button on the empty state page</li>
                <li>Right-click any folder in the sidebar and select &quot;Add Folder&quot;</li>
                <li>Use the dropdown menu (⋯) next to the Documents label in the sidebar</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Nested Folders</h3>
              <p className="text-sm text-muted-foreground">
                You can create folders within folders to build a hierarchical structure. Folders
                can be empty or contain documents and subfolders.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Delete a Folder</h3>
              <p className="text-sm text-muted-foreground">
                Right-click any folder in the sidebar and select &quot;Delete Folder&quot;. This
                will recursively delete the folder and all its contents (documents and
                subfolders).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Using the Editor</CardTitle>
            <CardDescription>
              Rich markdown editing with Tiptap
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Markdown Support</h3>
              <p className="text-sm text-muted-foreground">
                The editor supports full markdown syntax including headings, lists, code blocks,
                tables, links, images, and more. Use the toolbar at the top of the editor for
                quick formatting.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Bubble Menu</h3>
              <p className="text-sm text-muted-foreground">
                Select text to see a floating menu with formatting options. This provides quick
                access to common formatting without using the main toolbar.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Drag Handle</h3>
              <p className="text-sm text-muted-foreground">
                Use the drag handle on the left side of blocks to reorder content by dragging and
                dropping.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage & Data</CardTitle>
            <CardDescription>
              How your documents are stored and managed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Hybrid Storage</h3>
              <p className="text-sm text-muted-foreground">
                The application uses a hybrid approach: document metadata (titles, paths, IDs) is
                stored in a SQLite database, while document content is stored as markdown files on
                disk. This makes your content version-control friendly and editable with external
                tools.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">UUID-Based IDs</h3>
              <p className="text-sm text-muted-foreground">
                Each document has a UUID-based ID that remains stable even when filenames change.
                This ensures reliable references and prevents broken links.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">File Locations</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  server/documents.db
                </code>{" "}
                contains metadata, while{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  server/documents/
                </code>{" "}
                contains the markdown files.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center pt-4">
          <Button asChild>
            <Link href="/documents">Back to Documents</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
