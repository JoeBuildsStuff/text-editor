"use client"

import * as React from "react"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar" // Ensure these paths are correct
import { File } from "lucide-react"

export function SidebarLogo() {
return (
  <SidebarMenu>
    <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <File className="size-6" strokeWidth={1.5}/>
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Text Editor</span>
              <span className="truncate text-xs">By Joe Builds Stuff</span>
            </div>
          </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
)
}