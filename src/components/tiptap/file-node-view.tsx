'use client'

import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { 
  File, 
  AlertCircle,
  ExternalLink
} from 'lucide-react'
import { FileNodeAttributes } from './file-node'
import { X, Download } from 'lucide-react'
import Spinner from '@/components/ui/spinner'

export const FileNodeView = ({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) => {
  const attrs = node.attrs as FileNodeAttributes
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch download URL when component mounts
  useEffect(() => {
    const fetchDownloadUrl = async () => {
      if (!attrs.src) {
        setError('No file source provided')
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        
        // If it's already a full URL, use it directly
        if (attrs.src.startsWith('http')) {
          setDownloadUrl(attrs.src)
          setIsLoading(false)
          return
        }
        
        // For file paths, use our API to get a signed URL
        const apiUrl = `/api/files/serve?path=${encodeURIComponent(attrs.src)}`
        
        const response = await fetch(apiUrl)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to fetch file: ${response.status} - ${errorData.error || 'Unknown error'}`)
        }
        
        const data = await response.json()
        if (data.fileUrl) {
          setDownloadUrl(data.fileUrl)
        } else {
          throw new Error('Invalid response from file API')
        }
        
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching file URL:', err)
        setError(err instanceof Error ? err.message : 'Failed to load file')
        setIsLoading(false)
      }
    }

    fetchDownloadUrl()
  }, [attrs.src])

  const handleDownload = async () => {
    if (!downloadUrl) return
    
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attrs.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
      setError('Download failed')
    }
  }

  const handleOpenInBrowser = () => {
    if (!downloadUrl) return
    
    try {
      window.open(downloadUrl, '_blank')
    } catch (err) {
      console.error('Open in browser failed:', err)
      setError('Failed to open file in browser')
    }
  }

  const handleDelete = () => {
    deleteNode()
  }

  // Handle upload status
  useEffect(() => {
    if (attrs.uploadStatus === 'pending') {
      // Simulate upload completion
      setTimeout(() => {
        updateAttributes({ uploadStatus: 'completed' })
      }, 1000)
    }
  }, [attrs.uploadStatus, updateAttributes])

  return (
    <NodeViewWrapper>
      <div className={`my-4 rounded-lg ${selected ? 'ring-1 ring-foreground ring-offset-4 ring-offset-background' : ''}`}>
        <Card className="overflow-hidden px-2 m-0 py-1 rounded-lg">
          {/* Header with file info and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <File className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate text">{attrs.filename}</span>
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center">
              {attrs.uploadStatus === 'uploading' && (
                <Spinner className="stroke-neutral-400 stroke-5"/>
              )}
              {attrs.uploadStatus === 'error' && (
                <AlertCircle className="size-4 text-destructive" />
              )}
              {isLoading && (
                <span className="text-xs text-neutral-400">Loading...</span>
              )}
              {error && (
                <span className="text-xs text-destructive mr-2">{error}</span>
              )}
              {downloadUrl && !isLoading && (
                <>
                  <Button variant="ghost" size="icon" onClick={handleOpenInBrowser}>
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleDownload}>
                    <Download className="text-muted-foreground" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <X className="text-muted-foreground" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </NodeViewWrapper>
  )
}