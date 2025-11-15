"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be 80 characters or fewer"),
  image: z
    .union([
      z
        .string()
        .trim()
        .url("Enter a valid image URL"),
      z.literal(""),
    ])
    .optional()
    .default(""),
});

type ProfileValues = z.infer<typeof profileSchema>;

const emailSchema = z.object({
  newEmail: z.string().trim().email("Enter a valid email address"),
});

type EmailValues = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be 128 characters or fewer"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

type ProfileSettingsProps = {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const router = useRouter();
  const sessionState = authClient.useSession();

  const refreshSession = () => {
    authClient.$store.notify("$sessionSignal");
    router.refresh();
  };

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name ?? "",
      image: sessionState.data?.user?.image ?? "",
    },
  });

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      newEmail: user.email,
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    },
  });

  useEffect(() => {
    const image = sessionState.data?.user?.image ?? "";
    if (image && !profileForm.getValues("image")) {
      profileForm.setValue("image", image, { shouldDirty: false });
    }
  }, [sessionState.data?.user?.image, profileForm]);

  const initials = useMemo(() => {
    const source = (user.name && user.name.trim()) || user.email;
    return source
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);
  }, [user.email, user.name]);

  const watchedImage = useWatch({ control: profileForm.control, name: "image" });
  const profileImage =
    typeof watchedImage === "string" ? watchedImage.trim() : undefined;

  const handleProfileSubmit = async (values: ProfileValues) => {
    try {
      await authClient.updateUser({
        name: values.name.trim(),
        image: values.image?.trim() ?? "",
      });
      toast.success("Profile updated");
      refreshSession();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    }
  };

  const handleEmailSubmit = async (values: EmailValues) => {
    try {
      await authClient.changeEmail({
        newEmail: values.newEmail.trim(),
      });
      toast.success("Check your inbox to confirm the change");
      refreshSession();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update email"
      );
    }
  };

  const handlePasswordSubmit = async (values: PasswordValues) => {
    try {
      await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: values.revokeOtherSessions,
      });
      toast.success("Password updated");
      passwordForm.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        revokeOtherSessions: values.revokeOtherSessions,
      });
      refreshSession();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update password"
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            Update your name and the avatar that appears across the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {profileImage ? (
                <AvatarImage src={profileImage} alt={user.name ?? user.email} />
              ) : (
                <AvatarFallback className="text-base">
                  {initials || "U"}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="text-sm text-muted-foreground">
              This image should be a public URL. You can upload a photo
              anywhere and paste the link here.
            </div>
          </div>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
              className="space-y-6"
            >
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ada Lovelace" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profile image URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://example.com/avatar.png"
                      />
                    </FormControl>
                    <FormDescription>
                      Leave blank to remove your current profile photo.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={profileForm.formState.isSubmitting}
              >
                {profileForm.formState.isSubmitting
                  ? "Saving..."
                  : "Save changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Your current email is <span className="font-medium">{user.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit(handleEmailSubmit)}
              className="space-y-4"
            >
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" autoComplete="email" />
                    </FormControl>
                    <FormDescription>
                      We'll send a confirmation link to this address.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting ? "Sending..." : "Update email"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Create a strong password and sign out of other sessions if needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="revokeOtherSessions"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1">
                    <FormLabel>Sign out other devices</FormLabel>
                    <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Revoke other sessions</p>
                        <p className="text-sm text-muted-foreground">
                          Turn this on to log out everywhere else after changing your password.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
              >
                {passwordForm.formState.isSubmitting ? "Updating..." : "Reset password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
