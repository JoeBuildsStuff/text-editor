import { useCallback, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"

import { buildDocumentsPath } from "@/components/sidebar/tree/tree-utils"

export type UseDocumentNavigationReturn = {
  selectedSlug?: string | undefined
  navigateToSlug: (slug: string) => void
  navigateToDocuments: () => void
  updateSlugInPlace: (slug: string) => void
}

export function useDocumentNavigation(): UseDocumentNavigationReturn {
  const pathname = usePathname()
  const router = useRouter()

  const selectedSlug = useMemo(() => {
    if (!pathname.startsWith("/documents")) {
      return undefined
    }
    const segments = pathname
      .split("/")
      .slice(2)
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))

    if (!segments.length) {
      return undefined
    }

    return segments.join("/")
  }, [pathname])

  const navigateToSlug = useCallback(
    (slug: string) => {
      router.push(buildDocumentsPath(slug))
    },
    [router]
  )

  const navigateToDocuments = useCallback(() => {
    router.push("/documents")
  }, [router])

  const updateSlugInPlace = useCallback(
    (slug: string) => {
      router.replace(buildDocumentsPath(slug))
    },
    [router]
  )

  return {
    selectedSlug,
    navigateToSlug,
    navigateToDocuments,
    updateSlugInPlace,
  }
}
