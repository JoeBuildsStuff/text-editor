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
    <NodeViewWrapper className="code-block group relative">
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
        tooltipText="Copy code"
        iconSize={16}
        className="absolute right-2 top-3.5 size-6"
        variant="ghost"
        showTooltip={true}
      />
      <Separator className='absolute top-13 left-0 right-0' />
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  )
} 