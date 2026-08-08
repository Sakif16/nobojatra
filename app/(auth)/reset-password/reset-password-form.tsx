"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import PasswordField from "@/components/auth/PasswordField";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_REQUIREMENT_MESSAGE, isPasswordValid } from "@/lib/password";

export default function ResetPasswordForm({
  token,
  tokenError,
}: {
  token?: string;
  tokenError?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    tokenError ? "This reset link is invalid or expired." : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDisabled = !token || Boolean(tokenError);

  const confirmState =
    confirmPassword.length === 0
      ? "idle"
      : password === confirmPassword
        ? "match"
        : "mismatch";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    setPasswordError("");
    setConfirmError("");

    if (!token) {
      setErrorMessage("This reset link is invalid or expired.");
      return;
    }

    if (!isPasswordValid(password)) {
      setPasswordError(PASSWORD_REQUIREMENT_MESSAGE);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || "Unable to reset password.");
      return;
    }

    setMessage("Password reset successfully. Redirecting to sign in...");
    router.refresh();
    setTimeout(() => router.push("/signin"), 1200);
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Create a new password
      </h1>
      <p className="mt-2 text-muted-foreground">
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setPasswordError("");
          }}
          autoComplete="new-password"
          disabled={isDisabled}
          error={passwordError}
          hint={<PasswordRequirements password={password} />}
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            setConfirmError("");
          }}
          autoComplete="new-password"
          disabled={isDisabled}
          error={confirmError}
          hint={
            confirmState === "match" ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                <Check size={12} />
                Passwords match
              </p>
            ) : confirmState === "mismatch" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Passwords do not match yet.
              </p>
            ) : null
          }
        />

        {message ? (
          <p
            role="status"
            className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"
          >
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || isDisabled}
          className={buttonVariants({ size: "form" })}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Resetting…
            </>
          ) : (
            "Reset password"
          )}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Need a new link?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-primary hover:underline"
        >
          Request again
        </Link>
      </p>
    </>
  );
}
