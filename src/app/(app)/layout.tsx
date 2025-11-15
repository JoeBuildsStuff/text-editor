"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import ReportIssueButton from "@/components/report-issue-button";
import { DynamicBreadcrumbs } from "@/components/dynamic-breadcrumbs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto px-4 grid grid-rows-[auto_1fr] transition-all duration-300 ease-in-out">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 grow">
            <SidebarTrigger className="-ml-1" />
            <DynamicBreadcrumbs />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ReportIssueButton />
          </div>
        </header>
        <div className="mb-4 overflow-auto">{children}</div>
      </main>
    </SidebarProvider>
  );
}
