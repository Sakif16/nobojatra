"use client";

import { useState } from "react";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // TODO: Add your signup logic here
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-xl bg-purple-800 p-8 shadow-lg">
        <h1 className="mb-2 text-center text-3xl font-bold">Create Account</h1>
        <p className="mb-6 text-center text-white">
          Sign up to get started
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-white"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          {/* Email */}
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

          {/* Password */}
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

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium text-white"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-yellow-600 py-2.5 font-medium text-white transition hover:bg-yellow-700"
          >
            Sign Up
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white">
          Already have an account?{" "}
          <a
            href="/signin"
            className="font-medium text-yellow-600 hover:underline"
          >
            Login
          </a>
        </p>
      </div>
    </main>
  );
}