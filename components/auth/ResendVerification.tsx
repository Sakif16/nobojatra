"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

/**
 * "Resend verification email" with a cooldown, so a user who did not get the
 * first email can ask again without being able to flood an inbox. The server
 * limits this route too (lib/auth-security.ts).
 */
export default function ResendVerification({
  email,
  startCoolingDown = false,
}: {
  email: string;
  /** True right after an email was just sent (sign-up, or a blocked sign-in). */
  startCoolingDown?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(startCoolingDown ? COOLDOWN_SECONDS : 0);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function resend() {
    setIsSending(true);
    setMessage("");
    setFailed(false);

    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });

    setIsSending(false);
    if (error) {
      setFailed(true);
      setMessage(error.message || "Could not send the email. Try again shortly.");
      if (error.status === 429) setSecondsLeft(COOLDOWN_SECONDS);
      return;
    }
    setMessage("Verification email sent. Check your inbox and spam folder.");
    setSecondsLeft(COOLDOWN_SECONDS);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={resend}
        disabled={isSending || secondsLeft > 0}
        className={buttonVariants({ variant: "outline_primary", size: "form" })}
      >
        {isSending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending…
          </>
        ) : secondsLeft > 0 ? (
          `Resend available in ${secondsLeft}s`
        ) : (
          "Resend verification email"
        )}
      </button>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
