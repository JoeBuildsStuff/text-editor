import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session";

export default function SignUpPage() {
  const session = getServerSession();
  if (session) {
    redirect("/documents");
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>
          Start collaborating on documents in minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
      <CardFooter className="flex items-center justify-center text-sm text-muted-foreground">
        <span className="mr-1">Already have an account?</span>
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
