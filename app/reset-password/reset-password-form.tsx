"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

const PASSWORD_PATTERN = "(?=.*\\d).{8,}";
const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be at least 8 characters and include at least one number.";

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
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    tokenError ? "This reset link is invalid or expired." : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!token) {
      setErrorMessage("This reset link is invalid or expired.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold">Create New Password</h1>
        <p className="mb-6 text-center text-muted-foreground">
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium">
              New Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_REQUIREMENT_MESSAGE}
              required
              disabled={!token || Boolean(tokenError)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_REQUIREMENT_MESSAGE}
              required
              disabled={!token || Boolean(tokenError)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          {message ? <p className="text-sm text-primary">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || !token || Boolean(tokenError)}
            className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need a new link?{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request again
          </Link>
        </p>
      </div>
    </main>
  );
}
