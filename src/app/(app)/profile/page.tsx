import { redirect } from "next/navigation";

import { ProfileSettings } from "@/components/profile/profile-settings";
import { getServerSession } from "@/lib/auth/session";

export default async function ProfilePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?callbackUrl=/profile");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage how you appear across the app and keep your account secure
        </p>
      </div>
      <ProfileSettings
        user={{
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        }}
      />
    </div>
  );
}
