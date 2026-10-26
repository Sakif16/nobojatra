"use client";

import { Check, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import ResendVerification from "@/components/auth/ResendVerification";
import PasswordField from "@/components/auth/PasswordField";
import PasswordRequirements from "@/components/auth/PasswordRequirements";
import TextField from "@/components/auth/TextField";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  isPasswordValid,
  isValidEmail,
} from "@/lib/password";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the account exists but still has to be verified by email.
  const [pendingEmail, setPendingEmail] = useState("");

  // Only comment on the confirmation once there is something to compare.
  const confirmState =
    confirmPassword.length === 0
      ? "idle"
      : password === confirmPassword
        ? "match"
        : "mismatch";

  function validate(): FieldErrors {
    const errors: FieldErrors = {};

    if (!name.trim()) {
      errors.name = "Please enter your name.";
    }

    if (!email.trim()) {
      errors.email = "Please enter your email.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!isPasswordValid(password)) {
      errors.password = PASSWORD_REQUIREMENT_MESSAGE;
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    return errors;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);

    await authClient.signUp.email(
      {
        name,
        email,
        password,
        callbackURL: "/",
      },
      {
        onSuccess: (ctx) => {
          // With verification required there is no session yet: the user
          // finishes by clicking the emailed link, which signs them in.
          if (!ctx.data?.token) {
            setIsSubmitting(false);
            setPendingEmail(email.trim());
            return;
          }
          // Home picks up any trip stashed before signup and runs it.
          router.refresh();
          router.push("/");
        },
        onError: (ctx) => {
          setIsSubmitting(false);
          setFormError(ctx.error.message || "Unable to create your account.");
        },
      }
    );
  };

  if (pendingEmail) {
    return (
      <>
        <MailCheck size={32} className="text-primary" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Verification email sent
        </h1>
        <p className="mt-2 text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{pendingEmail}</span>.
          Click it to activate your account. The link expires in an hour, and
          it may land in your spam folder.
        </p>
        <div className="mt-8">
          <ResendVerification email={pendingEmail} startCoolingDown />
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Wrong address?{" "}
          <button
            type="button"
            onClick={() => setPendingEmail("")}
            className="font-medium text-primary hover:underline"
          >
            Start over
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Create your account
      </h1>
      <p className="mt-2 text-muted-foreground">
        Free, and it takes under a minute.
      </p>

      {/* Validation is handled in JS so every message renders inline and
          styled, instead of as a native browser bubble. */}
      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <TextField
          id="name"
          label="Name"
          placeholder="Your name"
          value={name}
          onChange={(value) => {
            setName(value);
            setFieldErrors((current) => ({ ...current, name: undefined }));
          }}
          autoComplete="name"
          error={fieldErrors.name}
        />

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

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          autoComplete="new-password"
          error={fieldErrors.password}
          hint={<PasswordRequirements password={password} />}
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            setFieldErrors((current) => ({
              ...current,
              confirmPassword: undefined,
            }));
          }}
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
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

        {formError ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {formError}
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
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{" "}
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
