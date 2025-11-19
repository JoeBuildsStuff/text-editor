import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, Users, FileText } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session";

const cards = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Manage users, admin roles, sessions, and passwords.",
    icon: Users,
  },
  {
    href: "/admin/audit",
    title: "Audit Log",
    description: "Review admin actions and history.",
    icon: FileText,
  },
];

export default async function AdminHomePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.isAdmin) {
    redirect("/documents");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="size-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">Quick links to admin tools.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href}>
              <Card className="hover:bg-accent transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base line-clamp-2">{card.title}</CardTitle>
                    <CardDescription className="text-xs mt-1 line-clamp-1">{card.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Go to {card.title.toLowerCase()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

