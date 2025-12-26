"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LoginPageForm } from "@/components/auth/login-page-form";
import { SignupPageForm } from "@/components/auth/signup-page-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export default function SignUpPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [showSignup, setShowSignup] = useState(true);

  useEffect(() => {
    // If already authenticated, redirect to documents
    if (!isPending && session?.user) {
      router.push("/documents");
    }
  }, [session, isPending, router]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If already authenticated, don't show signup (will redirect)
  if (session?.user) {
    return null;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className={cn("flex flex-col gap-6 w-full max-w-md")}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {showSignup ? "Create an account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {showSignup 
                ? "Sign up with your Google account or email"
                : "Sign in with your Google account or email"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showSignup ? (
              <SignupPageForm
                onSuccess={() => {
                  router.push("/documents");
                }}
                onSwitchToSignin={() => setShowSignup(false)}
              />
            ) : (
              <LoginPageForm
                onSuccess={() => {
                  router.push("/documents");
                }}
                onSwitchToSignup={() => setShowSignup(true)}
              />
            )}
          </CardContent>
        </Card>
        <FieldDescription className="px-6 text-center">
          By clicking continue, you agree to our{" "}
          <a href="#" className="underline-offset-4 hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="underline-offset-4 hover:underline">
            Privacy Policy
          </a>
          .
        </FieldDescription>
      </div>
    </div>
  );
}
