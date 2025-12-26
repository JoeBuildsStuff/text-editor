import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Layout is now handled by individual pages for better control
  return <>{children}</>;
}
