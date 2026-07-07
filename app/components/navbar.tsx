import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-purple-900/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold text-white">
          NoboJatra
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/signin"
            className="rounded-full border border-yellow-500 bg-transparent px-4 py-2 text-sm font-medium text-yellow-200 transition hover:border-yellow-400 hover:bg-yellow-500/10 hover:text-white"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-yellow-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-yellow-400"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
}
