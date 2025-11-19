import { redirect } from "next/navigation";

import { listAdminUsers } from "@/lib/auth/admin";
import { getServerSession } from "@/lib/auth/session";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.isAdmin) {
    redirect("/documents");
  }

  const users = listAdminUsers();

  return <AdminUsersClient initialUsers={users} />;
}
