"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowDownZA, ArrowUpAZ, CheckIcon, ListFilter } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type DocumentsSortKey = "modified" | "created"

type DocumentsSortDropdownProps = {
  value: DocumentsSortKey
  order: "asc" | "desc"
}

export function DocumentsSortDropdown({ value, order }: DocumentsSortDropdownProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function onValueChange(nextValue: string) {
    if (nextValue !== "modified" && nextValue !== "created") {
      return
    }

    const params = new URLSearchParams(searchParams.toString())

    if (nextValue === "modified") {
      params.delete("sort")
    } else {
      params.set("sort", nextValue)
    }

    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    })
  }

  function onOrderToggle() {
    const params = new URLSearchParams(searchParams.toString())
    const nextOrder = order === "desc" ? "asc" : "desc"

    if (nextOrder === "desc") {
      params.delete("order")
    } else {
      params.set("order", nextOrder)
    }

    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    })
  }

  function isSelected(key: DocumentsSortKey) {
    return value === key
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Sort documents"
          size="sm"
        >
          <ListFilter className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between">
            <DropdownMenuLabel className="flex-1 text-xs text-muted-foreground">
              Sort by
            </DropdownMenuLabel>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="m-0 size-6 p-0"
              onClick={onOrderToggle}
              aria-label={
                order === "desc"
                  ? "Switch to ascending order"
                  : "Switch to descending order"
              }
            >
              {order === "desc" ? (
                <ArrowDownZA className="size-4 text-muted-foreground" />
              ) : (
                <ArrowUpAZ className="size-4 text-muted-foreground" />
              )}
            </Button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onValueChange("modified")}>
            <span className="mr-auto">Modified</span>
            {isSelected("modified") ? <CheckIcon /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onValueChange("created")}>
            <span className="mr-auto">Created</span>
            {isSelected("created") ? <CheckIcon /> : null}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
