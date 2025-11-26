import { useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import {
  MARKDOWN_INDEX_STALE_TIME_MS,
} from "@/components/sidebar/constants"
import {
  fetchMarkdownIndex,
  type MarkdownIndexResult,
} from "@/components/sidebar/api/markdown-actions"
import type {
  MarkdownDocument,
  MarkdownFolder,
} from "@/components/sidebar/tree/tree-types"

export const MARKDOWN_INDEX_QUERY_KEY = ["markdown-index"] as const

export type UseMarkdownDataReturn = {
  documents: MarkdownDocument[]
  folders: MarkdownFolder[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  invalidate: () => Promise<void>
  setDocuments: (updater: (docs: MarkdownDocument[]) => MarkdownDocument[]) => void
  setFolders: (updater: (folders: MarkdownFolder[]) => MarkdownFolder[]) => void
  updateIndex: (
    updater: (current: MarkdownIndexResult) => MarkdownIndexResult
  ) => void
}

export function useMarkdownData(): UseMarkdownDataReturn {
  const queryClient = useQueryClient()

  const {
    data,
    error,
    isPending,
    refetch: refetchQuery,
  } = useQuery({
    queryKey: MARKDOWN_INDEX_QUERY_KEY,
    queryFn: ({ signal }) => fetchMarkdownIndex(signal),
    refetchOnWindowFocus: false,
    staleTime: MARKDOWN_INDEX_STALE_TIME_MS,
  })

  const documents = useMemo(() => data?.documents ?? [], [data])
  const folders = useMemo(() => data?.folders ?? [], [data])

  const refetch = useCallback(async () => {
    await refetchQuery()
  }, [refetchQuery])

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: MARKDOWN_INDEX_QUERY_KEY })
  }, [queryClient])

  const updateIndex = useCallback(
    (updater: (current: MarkdownIndexResult) => MarkdownIndexResult) => {
      queryClient.setQueryData<MarkdownIndexResult>(MARKDOWN_INDEX_QUERY_KEY, (current) => {
        const safeCurrent = current ?? { documents: [], folders: [] }
        return updater(safeCurrent)
      })
    },
    [queryClient]
  )

  const setDocuments = useCallback(
    (updater: (docs: MarkdownDocument[]) => MarkdownDocument[]) => {
      updateIndex((current) => ({
        ...current,
        documents: updater(current.documents),
      }))
    },
    [updateIndex]
  )

  const setFolders = useCallback(
    (updater: (folders: MarkdownFolder[]) => MarkdownFolder[]) => {
      updateIndex((current) => ({
        ...current,
        folders: updater(current.folders),
      }))
    },
    [updateIndex]
  )

  return {
    documents,
    folders,
    isLoading: isPending && !data,
    error: error instanceof Error ? error.message : null,
    refetch,
    invalidate,
    setDocuments,
    setFolders,
    updateIndex,
  }
}
