"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ChatFooterBar } from "@/components/chat/chat-footer-bar";
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
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 h-dvh transition-all duration-300 ease-in-out">
        <header className="flex h-10 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex grow items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <DynamicBreadcrumbs />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ReportIssueButton />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <ChatFooterBar />
      </main>
    </SidebarProvider>
  );
}
