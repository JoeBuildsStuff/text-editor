import Tiptap from "@/components/tiptap/tiptap";

export default function DocumentsPage() {

const markdownContent = `
# Hello World

This is a test of the Tiptap editor.
`

  return (
    <div className="flex max-w-4xl mx-auto h-full w-full">
      <Tiptap content={markdownContent} />
    </div>
  );
}