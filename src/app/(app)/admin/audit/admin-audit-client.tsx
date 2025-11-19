"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminActionEntry } from "@/lib/auth/admin";

type Props = {
  initialActions: AdminActionEntry[];
  pageSize?: number;
};

export function AdminAuditClient({ initialActions, pageSize = 50 }: Props) {
  const [actions, setActions] = useState<AdminActionEntry[]>(initialActions);
  const [isRefreshing, startRefresh] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const [hasMore, setHasMore] = useState(initialActions.length >= pageSize);

  const refresh = () => {
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/admin/audit?limit=${pageSize}&offset=0`);
        if (!res.ok) throw new Error("Failed to load audit log");
        const data = (await res.json()) as { actions?: AdminActionEntry[] };
        setActions(data.actions ?? []);
        setHasMore((data.actions?.length ?? 0) >= pageSize);
      } catch (error) {
        console.error(error);
        toast.error("Failed to refresh audit log");
      }
    });
  };

  const loadMore = () => {
    startLoadMore(async () => {
      try {
        const offset = actions.length;
        const res = await fetch(`/api/admin/audit?limit=${pageSize}&offset=${offset}`);
        if (!res.ok) throw new Error("Failed to load more");
        const data = (await res.json()) as { actions?: AdminActionEntry[] };
        const next = data.actions ?? [];
        setActions((prev) => {
          const existing = new Set(prev.map((a) => a.id));
          return [...prev, ...next.filter((a) => !existing.has(a.id))];
        });
        setHasMore(next.length >= pageSize);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load more");
      }
    });
  };

  const rows = useMemo(() => actions, [actions]);

  const fmt = (value: string | null) => value || "—";

  const formatMetadata = (meta: unknown) => {
    if (meta === null || meta === undefined) return "—";
    if (typeof meta === "string") return meta;
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
          <div>
            <CardTitle>Admin: Audit Log</CardTitle>
            <CardDescription>History of admin actions (newest first).</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>User Agent</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="font-medium">{entry.action}</TableCell>
                <TableCell>
                  {fmt(entry.actorEmail)}
                  <div className="text-xs text-muted-foreground">{entry.actorUserId}</div>
                </TableCell>
                <TableCell>
                  {fmt(entry.targetEmail)}
                  {entry.targetUserId ? (
                    <div className="text-xs text-muted-foreground">{entry.targetUserId}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmt(entry.ip)}</TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {fmt(entry.userAgent)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatMetadata(entry.metadata)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableCaption>Admin actions are listed newest first.</TableCaption>
        </Table>
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">Showing {rows.length} entries</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="secondary" size="sm" onClick={loadMore} disabled={!hasMore || isLoadingMore}>
              {isLoadingMore ? "Loading..." : hasMore ? "Load more" : "No more"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

