"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useServerFeatures } from "@/components/features/FeatureProvider";
import { buttonVariants } from "@/components/ui/button";
import StatusMessage from "@/components/ui/status-message";
import { authClient } from "@/lib/auth-client";

// What Better Auth puts in ?error= when it sends the user back from Google.
const ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "This email already has a NoboJatra account that is not verified yet. Verify it from the email we sent, or sign in with your password, then try Google again.",
  access_denied: "Google sign-in was cancelled.",
};
const DEFAULT_ERROR = "Google sign-in did not complete. Please try again.";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function GoogleSignInInner() {
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const returnedError = searchParams.get("error");
  const shownError =
    errorMessage || (returnedError ? ERROR_MESSAGES[returnedError] ?? DEFAULT_ERROR : "");

  async function signInWithGoogle() {
    setIsRedirecting(true);
    setErrorMessage("");

    // On success the browser is sent to Google and this never returns. Home
    // picks up any trip stashed before sign-in, same as the password forms.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      newUserCallbackURL: "/",
      errorCallbackURL: "/signin",
    });

    if (error) {
      setIsRedirecting(false);
      setErrorMessage(
        error.status === 429
          ? "Too many attempts. Please wait a moment and try again."
          : DEFAULT_ERROR,
      );
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      {shownError ? <StatusMessage>{shownError}</StatusMessage> : null}

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={isRedirecting}
        className={buttonVariants({ variant: "outline", size: "form" })}
      >
        {isRedirecting ? (
          <>
            <Loader2 size={16} className="motion-safe:animate-spin" />
            Redirecting to Google…
          </>
        ) : (
          <>
            <GoogleIcon />
            Continue with Google
          </>
        )}
      </button>
    </div>
  );
}

/** Renders nothing unless this server has Google credentials (see lib/env.ts). */
export default function GoogleSignIn() {
  const { googleSignIn } = useServerFeatures();
  if (!googleSignIn) return null;

  return (
    <Suspense fallback={null}>
      <GoogleSignInInner />
    </Suspense>
  );
}
