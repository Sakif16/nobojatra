"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const { data, error } = await authClient.signIn.email({
    email, // required
    password, // required
    rememberMe: true,
    callbackURL: "/dashboard",
});
    
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold">Welcome Back</h1>
        <p className="mb-6 text-center text-muted-foreground">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="space-y-5">
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
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}
