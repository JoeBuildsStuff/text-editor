'use client'

import { Editor, useEditorState } from '@tiptap/react'
import { Link2, X } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface LinkButtonProps {
    editor: Editor
    size?: 'sm' | 'default'
    className?: string
}

export const LinkButton = ({ editor, size = 'sm', className = '' }: LinkButtonProps) => {
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
    const [url, setUrl] = useState('')
    const [error, setError] = useState('')
    
    const editorState = useEditorState({
        editor,
        selector: (state: { editor: Editor }) => ({
            isLink: state.editor.isActive('link'),
        }),
    })

    const handleOpenDialog = () => {
        // Check if there's an active link at the current selection
        const isActiveLink = editor.isActive('link')
        let previousUrl = ''
        
        if (isActiveLink) {
            // Get the href from the active link
            previousUrl = editor.getAttributes('link').href || ''
        }
        
        setUrl(previousUrl)
        setError('')
    }

    const handleButtonClick = () => {
        handleOpenDialog()
        setIsLinkDialogOpen(true)
    }

    const handleSetLink = () => {
        setError('')
        
        // empty - remove link
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            setIsLinkDialogOpen(false)
            return
        }

        // update link
        try {
            // If there's no selection, create a link with the current word
            if (editor.state.selection.empty) {
                editor.chain().focus().setLink({ href: url }).run()
            } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
            }
            setIsLinkDialogOpen(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid URL')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSetLink()
        }
    }

    return (
        <>
            <Tooltip>
                <TooltipTrigger>
                    <Toggle
                        onClick={handleButtonClick}
                        pressed={editorState.isLink}
                        size={size}
                        className={className}
                    >
                        <Link2 className='' />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Link <span className='ml-2'>⌘K</span></p>
                </TooltipContent>
            </Tooltip>
            <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="url">URL</Label>
                            <div className="relative">
                                <Input
                                    id="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="https://example.com"
                                    autoFocus
                                    className="pr-8"
                                />
                                {url && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                                        onClick={() => setUrl('')}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                        </div>
                        <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSetLink}>
                                {url === '' ? 'Remove Link' : 'Set Link'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
} 