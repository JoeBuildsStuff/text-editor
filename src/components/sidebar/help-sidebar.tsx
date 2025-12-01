"use client"

import { useEffect, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SidebarLogo } from "@/components/sidebar/app-sidebar-logo"

interface DocFile {
  name: string
  title: string
}

export function HelpSidebar() {
  const [files, setFiles] = useState<DocFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedFile = searchParams.get("doc")

  useEffect(() => {
    async function fetchFiles() {
      try {
        const response = await fetch("/api/docs")
        if (response.ok) {
          const data = await response.json()
          setFiles(data.files || [])
        }
      } catch (error) {
        console.error("Failed to fetch docs files", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchFiles()
  }, [])

  const handleFileClick = (fileName: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("doc", fileName)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarLogo />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Documentation</SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>Loading...</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            ) : files.length === 0 ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>No docs found</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            ) : (
              <SidebarMenu>
                {files.map((file) => (
                  <SidebarMenuItem key={file.name}>
                    <SidebarMenuButton
                      onClick={() => handleFileClick(file.name)}
                      isActive={selectedFile === file.name}
                      className="w-full justify-start"
                    >
                      <span>{file.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

