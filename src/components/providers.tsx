'use client'

import { ReactNode } from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: ReactNode }) {

  return (
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            {children}
            <Toaster position="top-center" richColors/>
          </SidebarProvider>
        </ThemeProvider>
  )
}
