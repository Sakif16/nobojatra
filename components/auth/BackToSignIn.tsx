"use client";

import { usePathname } from "next/navigation";
import BackLink from "@/components/BackLink";

/**
 * The auth header's escape hatch.
 *
 * It used to read "Back to home" and point at "/", but there is no landing
 * page any more — "/" is the planner, and it redirects visitors straight back
 * to sign in. So the link now names where it actually goes, and renders
 * nothing on the sign-in page itself rather than pointing at the current page.
 */
export default function BackToSignIn() {
  const pathname = usePathname();

  if (pathname === "/signin") return null;

  return <BackLink href="/signin" label="Back to sign in" />;
}
