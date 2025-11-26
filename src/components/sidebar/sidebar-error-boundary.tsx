"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

type SidebarErrorBoundaryProps = {
  children: ReactNode
  onReset?: () => void
}

type SidebarErrorBoundaryState = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class SidebarErrorBoundary extends Component<
  SidebarErrorBoundaryProps,
  SidebarErrorBoundaryState
> {
  state: SidebarErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: Error): SidebarErrorBoundaryState {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error("Sidebar crashed", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm text-muted-foreground">
              The sidebar crashed. Try reloading it below.
            </p>
          </div>
          <Button variant="outline" onClick={this.handleReset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reload Sidebar
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
