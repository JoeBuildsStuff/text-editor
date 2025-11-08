'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Type definitions for docx-preview
declare module 'docx-preview' {
  interface RenderOptions {
    className?: string
    inWrapper?: boolean
    ignoreWidth?: boolean
    ignoreHeight?: boolean
    ignoreFonts?: boolean
    breakPages?: boolean
    ignoreLastRenderedPageBreak?: boolean
    experimental?: boolean
    trimXmlDeclaration?: boolean
  }

  export function renderAsync(
    data: File | ArrayBuffer | Uint8Array,
    container: HTMLElement,
    options?: RenderOptions
  ): Promise<void>
}

interface DocumentPreviewProps {
  filePath: string
  filename: string
  fileType: string
  fileSize: number
  onDownload?: () => void
}

export const DocumentPreview = ({ filePath, filename, fileType, fileSize, onDownload }: DocumentPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string>('')
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)

  // Fetch file data when component mounts
  useEffect(() => {
    const fetchFileData = async () => {
      if (!filePath) {
        setError('No file path provided')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        
        // Get signed URL for the file
        const apiUrl = `/api/files/serve?path=${encodeURIComponent(filePath)}`
        const response = await fetch(apiUrl)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to fetch file: ${response.status} - ${errorData.error || 'Unknown error'}`)
        }
        
        const data = await response.json()
        if (!data.fileUrl) {
          throw new Error('Invalid response from file API')
        }

        // Fetch the actual file data
        const fileResponse = await fetch(data.fileUrl)
        if (!fileResponse.ok) {
          throw new Error('Failed to fetch file content')
        }

        const arrayBuffer = await fileResponse.arrayBuffer()
        setFileData(arrayBuffer)
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching file data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load file')
        setIsLoading(false)
      }
    }

    fetchFileData()
  }, [filePath])

  // Render document when file data is available
  useEffect(() => {
    const renderDocument = async () => {
      if (!containerRef.current || !fileData) return

      try {
        if (fileType === 'text/plain') {
          // Handle .txt files
          const decoder = new TextDecoder('utf-8')
          const text = decoder.decode(fileData)
          setTextContent(text)
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // Handle .docx files
          const { renderAsync } = await import('docx-preview')
          
          // Clear container
          containerRef.current.innerHTML = ''
          
          await renderAsync(fileData, containerRef.current, {
            className: 'docx-wrapper',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: false,
            experimental: false,
            trimXmlDeclaration: true,
          })
        }
      } catch (err) {
        console.error('Error rendering document:', err)
        setError('Failed to preview document')
      }
    }

    if (fileData) {
      renderDocument()
    }
  }, [fileData, fileType])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base font-medium">{filename}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(fileSize)} • {fileType || 'Unknown type'}
              </p>
            </div>
          </div>
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        
        {error && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="font-medium">Preview not available</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
        
        {!isLoading && !error && fileType === 'text/plain' && (
          <div className="bg-muted/30 rounded-md p-4">
            <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
              {textContent}
            </pre>
          </div>
        )}
        
        {!isLoading && !error && fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
          <div 
            ref={containerRef}
            className="docx-container prose prose-sm max-w-none [&_.docx-wrapper]:border-0 [&_.docx-wrapper]:shadow-none"
          />
        )}
      </CardContent>
    </Card>
  )
}