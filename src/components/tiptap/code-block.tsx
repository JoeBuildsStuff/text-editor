'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CopyButton } from '@/components/ui/copy-button'
import { Separator } from '@/components/ui/separator'

export function CodeBlock(props: NodeViewProps) {
  const languages = props.extension.options.lowlight.listLanguages()

  const handleLanguageChange = (language: string) => {
    props.updateAttributes({ language })
  }

  return (
    <NodeViewWrapper className="bg-background code-block group relative rounded-md border border-border mb-4">
      <Select
        defaultValue={props.node.attrs.language || 'plaintext'}
        onValueChange={handleLanguageChange}
      >
        <SelectTrigger className="absolute left-2 top-2 w-fit border-none bg-transparent shadow-none" >
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang: string) => (
            <SelectItem key={lang} value={lang}>
              {lang}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CopyButton
        textToCopy={props.node.textContent}
        successMessage="Code copied to clipboard"
        iconSize={16}
        className="absolute right-2 top-3.5 size-6"
        variant="ghost"
      />
      <Separator className='absolute top-[3.12rem] left-0 right-0' />
      <pre className="pt-9 pb-4 mb-0 bg-background">
        <NodeViewContent className="hljs"/>
      </pre>
    </NodeViewWrapper>
  )
}
