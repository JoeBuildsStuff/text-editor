"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Sun,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

export function UserMenu() {
  const sessionState = authClient.useSession();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  
  const handleSignOut = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/sign-in");
            router.refresh();
          },
        },
      });
      toast.success("Signed out");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sign out"
      );
    }
  };

  if (sessionState.isPending) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="hidden sm:block">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-1 h-3 w-32" />
        </div>
      </div>
    );
  }

  if (!sessionState.data?.user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  const user = sessionState.data.user;
  const displayName = user.name?.trim() || user.email;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-2"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-1 text-left text-sm leading-tight sm:grid">
            <span className="truncate font-medium">{displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto hidden size-4 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56 rounded-lg"
        sideOffset={4}
        side={isMobile ? "bottom" : "right"}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="font-light" asChild>
          <Link href="/profile">
            <User className="size-4" strokeWidth={1.5} />
            <span className="font-light">Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
          className="font-light"
        >
          {resolvedTheme === "dark" ? (
            <>
              <Sun className="size-4" strokeWidth={1.5} />
              <span className="font-light">Toggle Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="size-4" strokeWidth={1.5} />
              <span className="font-light">Toggle Dark Mode</span>
            </>
          )}
          <span className="sr-only">Toggle Theme</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
          className="font-light"
        >
          <LogOut className="size-4" strokeWidth={1.5} />
          <span className="font-light">Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
