"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import PasswordField from "@/components/auth/PasswordField";
import TextField from "@/components/auth/TextField";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Deliberately generic: never reveal whether the email exists on this account.
const LOGIN_ERROR_MESSAGE = "Invalid email or password.";

type FieldErrors = {
  email?: string;
  password?: string;
};

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Please enter your email.";
    if (!password) errors.password = "Please enter your password.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);

    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
    });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(LOGIN_ERROR_MESSAGE);
      return;
    }

    // Stays in the submitting state through the navigation so the button never
    // flicks back to idle mid-redirect.
    router.refresh();
    router.push("/");
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Welcome back
      </h1>
      <p className="mt-2 text-muted-foreground">
        Sign in to pick up where you left off.
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
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          autoComplete="email"
          error={fieldErrors.email}
        />

        <div>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            autoComplete="current-password"
            error={fieldErrors.password}
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

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
          className={buttonVariants({ size: "form" })}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}
