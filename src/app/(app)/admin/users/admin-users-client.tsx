"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserSummary } from "@/lib/auth/admin";

type Props = {
  initialUsers: AdminUserSummary[];
};

export function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<AdminUserSummary[]>(initialUsers);
  const [isRefreshing, startRefresh] = useTransition();
  const [inFlight, setInFlight] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  const refresh = () => {
    startRefresh(async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error("Failed to load users");
        const data = (await res.json()) as { users: AdminUserSummary[] };
        setUsers(data.users ?? []);
      } catch (error) {
        console.error(error);
        toast.error("Failed to refresh users");
      }
    });
  };

  useEffect(() => {
    // re-fetch on mount to ensure freshest state
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAdmin = (userId: string, next: boolean) => {
    setInFlight((prev) => ({ ...prev, [userId]: true }));
    fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isAdmin: next }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to update user");
        }
        const data = (await res.json()) as { user?: AdminUserSummary };
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...(data.user ?? {}), isAdmin: next } : u))
        );
        toast.success(next ? "User promoted to admin" : "Admin access removed");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || "Failed to update user");
        refresh();
      })
      .finally(() => {
        setInFlight((prev) => {
          const copy = { ...prev };
          delete copy[userId];
          return copy;
        });
      });
  };

  const revokeSessions = (userId: string) => {
    setInFlight((prev) => ({ ...prev, [`sessions-${userId}`]: true }));
    fetch(`/api/admin/users/${userId}/sessions`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to revoke sessions");
        }
        const data = (await res.json()) as { deleted?: number };
        toast.success(`Revoked ${data.deleted ?? 0} sessions`);
        refresh();
      })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || "Failed to revoke sessions");
      })
      .finally(() => {
        setInFlight((prev) => {
          const copy = { ...prev };
          delete copy[`sessions-${userId}`];
          return copy;
        });
      });
  };

  const confirmDeleteUser = () => {
    if (!deleteTarget) return;
    const { id: userId } = deleteTarget;
    setInFlight((prev) => ({ ...prev, [`delete-${userId}`]: true }));
    fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to delete user");
        }
        const data = (await res.json()) as { result?: { deletedUser?: boolean } };
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        toast.success(data?.result?.deletedUser ? "User deleted" : "User removed");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || "Failed to delete user");
      })
      .finally(() => {
        setDeleteTarget(null);
        setInFlight((prev) => {
          const copy = { ...prev };
          delete copy[`delete-${userId}`];
          return copy;
        });
      });
  };

  const loading = (userId: string) => Boolean(inFlight[userId]);
  const sessionsLoading = (userId: string) => Boolean(inFlight[`sessions-${userId}`]);
  const deletingUser = (userId: string) => Boolean(inFlight[`delete-${userId}`]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Admin: Users</CardTitle>
          <CardDescription>Manage users, grant admin, revoke sessions.</CardDescription>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.name || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={user.isAdmin}
                      disabled={loading(user.id)}
                      onCheckedChange={(checked) => toggleAdmin(user.id, checked)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {user.isAdmin ? "Admin" : "User"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{user.sessionCount}</TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sessionsLoading(user.id)}
                    onClick={() => revokeSessions(user.id)}
                  >
                    {sessionsLoading(user.id) ? "Revoking..." : "Revoke sessions"}
                  </Button>
                  <AlertDialog
                    open={Boolean(deleteTarget && deleteTarget.id === user.id)}
                    onOpenChange={(open) => {
                      if (!open) setDeleteTarget(null);
                    }}
                  >
                    <Button
                      size="sm"
                      variant="destructive"
                      className="ml-2"
                      disabled={deletingUser(user.id)}
                      onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                    >
                      {deletingUser(user.id) ? "Deleting..." : "Delete"}
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {user.email}&apos;s sessions, admin role, documents, and uploads. This action is destructive and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={confirmDeleteUser}
                          disabled={deletingUser(user.id)}
                        >
                          {deletingUser(user.id) ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableCaption>Only admins can access this page.</TableCaption>
        </Table>
      </CardContent>
    </Card>
  );
}
