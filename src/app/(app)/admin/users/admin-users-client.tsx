"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis, KeyRound, RefreshCw, Trash2 } from "lucide-react";
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
  const [createForm, setCreateForm] = useState({ email: "", name: "", password: "", isAdmin: false });
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; email: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

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

  const createUser = () => {
    if (!createForm.email.trim() || !createForm.password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    setInFlight((prev) => ({ ...prev, create: true }));
    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to create user");
        }
        const data = (await res.json()) as { user?: AdminUserSummary };
        if (data.user) {
          setUsers((prev) => [data.user!, ...prev]);
          toast.success("User created");
        }
        setCreateForm({ email: "", name: "", password: "", isAdmin: false });
        setCreateOpen(false);
      })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || "Failed to create user");
      })
      .finally(() => {
        setInFlight((prev) => {
          const copy = { ...prev };
          delete copy.create;
          return copy;
        });
      });
  };

  const setPassword = () => {
    if (!passwordTarget) return;
    if (!passwordInput.trim()) {
      toast.error("Password is required");
      return;
    }
    const userId = passwordTarget.id;
    setInFlight((prev) => ({ ...prev, [`pwd-${userId}`]: true }));
    fetch(`/api/admin/users/${userId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to set password");
        }
        toast.success("Password updated");
        setPasswordTarget(null);
        setPasswordInput("");
      })
      .catch((error) => {
        console.error(error);
        toast.error(error.message || "Failed to set password");
      })
      .finally(() => {
        setInFlight((prev) => {
          const copy = { ...prev };
          delete copy[`pwd-${userId}`];
          return copy;
        });
      });
  };

  const loading = (userId: string) => Boolean(inFlight[userId]);
  const sessionsLoading = (userId: string) => Boolean(inFlight[`sessions-${userId}`]);
  const deletingUser = (userId: string) => Boolean(inFlight[`delete-${userId}`]);
  const creatingUser = Boolean(inFlight.create);
  const settingPassword = (userId: string) => Boolean(inFlight[`pwd-${userId}`]);

  return (
    <>
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full justify-between">
          <div>
            <CardTitle>Admin: Users</CardTitle>
            <CardDescription>Manage users, grant admin, revoke sessions.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm">Create user</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create user</DialogTitle>
                  <DialogDescription>Create a credential user with optional admin access.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1">
                    <Label htmlFor="new-email">Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-name">Name (optional)</Label>
                    <Input
                      id="new-name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Display name"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-password">Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Temporary password"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={createForm.isAdmin}
                      onCheckedChange={(checked) => setCreateForm((f) => ({ ...f, isAdmin: checked }))}
                    />
                    <span className="text-sm">Make admin</span>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={createUser} disabled={creatingUser || !createForm.email || !createForm.password}>
                    {creatingUser ? "Creating..." : "Create user"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
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
                      <Switch
                        checked={user.isAdmin}
                        disabled={loading(user.id)}
                        onCheckedChange={(checked) => toggleAdmin(user.id, checked)}
                      />
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="px-2">
                        <Ellipsis className="h-4 w-4" />
                        <span className="sr-only">Open actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        disabled={sessionsLoading(user.id)}
                        onClick={() => revokeSessions(user.id)}
                        className="flex items-center"
                      >
                        <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>{sessionsLoading(user.id) ? "Revoking..." : "Revoke sessions"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={settingPassword(user.id)}
                        onClick={() => {
                          setPasswordTarget({ id: user.id, email: user.email });
                          setPasswordInput("");
                        }}
                        className="flex items-center"
                      >
                        <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>{settingPassword(user.id) ? "Saving..." : "Set password"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                      variant="destructive"
                        // className="text-destructive focus:text-destructive flex items-center"
                        disabled={deletingUser(user.id)}
                        onClick={() => setDeleteTarget({ id: user.id, email: user.email })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>{deletingUser(user.id) ? "Deleting..." : "Delete"}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialog
                    open={Boolean(deleteTarget && deleteTarget.id === user.id)}
                    onOpenChange={(open) => {
                      if (!open) setDeleteTarget(null);
                    }}
                  >
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

      <AlertDialog
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null);
            setPasswordInput("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set password</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new password for {passwordTarget?.email}. This does not change admin access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="set-password">New password</Label>
            <Input
              id="set-password"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPasswordTarget(null);
                setPasswordInput("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!passwordInput.trim() || (passwordTarget ? settingPassword(passwordTarget.id) : false)}
              onClick={setPassword}
            >
              {passwordTarget ? (settingPassword(passwordTarget.id) ? "Saving..." : "Save") : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
