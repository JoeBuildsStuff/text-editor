import { redirect } from "next/navigation";

import { listAdminActions } from "@/lib/auth/admin";
import { getServerSession } from "@/lib/auth/session";
import { AdminAuditClient } from "./admin-audit-client";

const PAGE_SIZE = 50;

export default async function AdminAuditPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.isAdmin) {
    redirect("/documents");
  }

  const actions = listAdminActions(PAGE_SIZE, 0);

  return <AdminAuditClient initialActions={actions} pageSize={PAGE_SIZE} />;
}

