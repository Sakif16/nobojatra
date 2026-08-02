"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const PASSWORD_PATTERN = "(?=.*\\d).{8,}";
const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be at least 8 characters and include at least one number.";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    await authClient.signUp.email({
        name, // user display name
        email, // user email address
        password, // server requires min 8 characters and at least one number
        callbackURL: "/dashboard" // A URL to redirect to after the user verifies their email (optional)
    }, {
        onSuccess: () => {
            //redirect to the dashboard or sign in page
            router.refresh();
            router.push("/dashboard");
        },
        onError: (ctx) => {
            // display the error message
            alert(ctx.error.message);
        },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold">Create Account</h1>
        <p className="mb-6 text-center text-muted-foreground">
          Sign up to get started
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_REQUIREMENT_MESSAGE}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_REQUIREMENT_MESSAGE}
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Sign Up
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/signin"
            className="font-medium text-primary hover:underline"
          >
            Login
          </a>
        </p>
      </div>
    </main>
  );
}
