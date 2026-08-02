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

type DnsModule = { setServers: (servers: string[]) => void };

type ProcessWithBuiltinModule = typeof process & {
  getBuiltinModule?: (id: string) => unknown;
};

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;

  const getBuiltinModule = (process as ProcessWithBuiltinModule)
    .getBuiltinModule;

  // Added in Node 22.3 — skip the workaround rather than crash on older runtimes.
  if (typeof getBuiltinModule !== "function") return;

  const dns = getBuiltinModule("node:dns") as DnsModule | undefined;
  dns?.setServers(["1.1.1.1", "8.8.8.8"]);
}
