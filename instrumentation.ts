// Some local networks fail to resolve MongoDB Atlas SRV records through the
// default system resolver, which makes dbConnect() hang on startup. Pointing
// Node at public resolvers works around it in development.
//
// Production hosts (Vercel, Railway, etc.) resolve SRV records fine, so this
// stays dev-only. Drop the NODE_ENV check if you deploy somewhere that needs it.
//
// Next bundles this file for the Edge runtime too, and a plain `import
// "node:dns"` makes that build warn. process.getBuiltinModule keeps the module
// out of the bundle graph entirely, so only Node ever resolves it.

import { checkEnvironment, formatEnvironmentReport } from "@/lib/env";

type DnsModule = { setServers: (servers: string[]) => void };

type ProcessWithBuiltinModule = typeof process & {
  getBuiltinModule?: (id: string) => unknown;
};

/**
 * Checks the environment once, before the first request: every missing
 * required setting is named together, and each optional feature that is off is
 * logged with what it costs. Without this a missing key surfaces one broken
 * screen at a time.
 */
function checkStartupEnvironment() {
  const report = checkEnvironment(process.env);
  const message = formatEnvironmentReport(report);

  if (report.problems.length > 0) {
    // Thrown, not logged: a server missing these cannot plan a single trip.
    throw new Error(message ?? "Required settings are missing.");
  }

  if (message) console.warn(message);
}

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // `next build` loads this file too, and CI builds with placeholders only.
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    checkStartupEnvironment();
  }

  if (process.env.NODE_ENV === "production") return;

  const getBuiltinModule = (process as ProcessWithBuiltinModule)
    .getBuiltinModule;

  // Added in Node 22.3 — skip the workaround rather than crash on older runtimes.
  if (typeof getBuiltinModule !== "function") return;

  const dns = getBuiltinModule("node:dns") as DnsModule | undefined;
  dns?.setServers(["1.1.1.1", "8.8.8.8"]);
}
