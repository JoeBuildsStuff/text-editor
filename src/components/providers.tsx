'use client'

import { ReactNode, useState } from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChatProvider } from '@/components/chat'
import { useChatStore } from '@/lib/chat/chat-store'
import { cn } from '@/lib/utils'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const isMaximized = useChatStore((s) => s.isMaximized)

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ChatProvider>
          <div
            className={cn(
              "min-h-screen w-full min-w-0 flex-1 transition-all duration-300 ease-in-out",
              // When chat is inset, constrain width so content is pushed left (no overlap)
              isMaximized && "md:mr-96"
            )}
          >
            {children}
          </div>
        </ChatProvider>
      </QueryClientProvider>
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  )
}
