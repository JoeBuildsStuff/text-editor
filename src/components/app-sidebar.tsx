"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { File } from "lucide-react"
import { SidebarLogo } from "@/components/app-sidebar-logo"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

export function AppSidebar() {
  const pathname = usePathname()

  const navigationItems = [
    {
      label: "New document",
      href: "/documents",
      icon: File,
    },
  ]

  return (
    <>
      <Sidebar>
        <SidebarHeader className="">
          <SidebarLogo />
        </SidebarHeader>


        <SidebarContent className="flex flex-col">
          {/* Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      asChild
                      className={cn(
                        "w-full justify-start",
                        pathname.startsWith(item.href)
                          ? "bg-muted/50 hover:bg-muted font-semibold"
                          : "hover:bg-muted"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-3.5 h-3.5 mr-2 flex-none text-muted-foreground" />
                        <span className="font-normal">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          
        </SidebarContent>
        <SidebarFooter className="">
          {/* Footer */}
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
