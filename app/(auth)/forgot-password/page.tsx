"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import TextField from "@/components/auth/TextField";
import { authClient } from "@/lib/auth-client";
import { isValidEmail } from "@/lib/password";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    setFieldError("");

    if (!email.trim()) {
      setFieldError("Please enter your email.");
      return;
    }

    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || "Unable to send reset link.");
      return;
    }

    setMessage(
      data?.message ||
        "If this email exists in our system, check your email for the reset link.",
    );
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Reset your password
      </h1>
      <p className="mt-2 text-muted-foreground">
        Enter your email and we&apos;ll send a reset link. It expires in an hour.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <TextField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(value) => {
            setEmail(value);
            setFieldError("");
          }}
          autoComplete="email"
          error={fieldError}
        />

        {message ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary"
          >
            <MailCheck size={16} className="mt-0.5 flex-shrink-0" />
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
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/signin"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
