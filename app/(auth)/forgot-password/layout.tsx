import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getServerFeatures } from "@/lib/env";

// The page itself is a client component, which cannot export metadata, so its
// title lives here.
export const metadata: Metadata = { title: "Reset your password" };

export default function Layout({ children }: { children: React.ReactNode }) {
  // Without an email key no reset link can be sent. The form would still say
  // "check your email", so it is replaced by the reason it cannot help.
  if (!getServerFeatures(process.env).passwordResetEmail) {
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Password reset is not set up
        </h1>
        <p role="status" className="mt-2 text-muted-foreground">
          This server cannot send email, so it has no way to send a reset link.
          Ask whoever runs it to reset your password.
        </p>
        <Link href="/signin" className={`${buttonVariants({ size: "md" })} mt-8`}>
          Back to sign in
        </Link>
      </>
    );
  }

  return children;
}
