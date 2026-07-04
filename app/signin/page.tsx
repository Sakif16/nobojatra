"use client";

import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // TODO: Add your signin logic here
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-xl bg-purple-800 p-8 shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">Welcome Back</h1>
        <p className="mb-6 text-center text-white">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-white"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-white"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-yellow-600 py-2.5 font-medium text-white transition hover:bg-yellow-700"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-yellow-600 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}
