import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Loads one of the app's TypeScript modules for a test, without a bundler.
 *
 * The file is transpiled and run with a `require` that resolves "@/lib/..."
 * imports to the real modules, loaded the same way, and everything else from
 * `mocks`. An import that is neither is an error, so a test always states
 * which outside pieces it replaces.
 */
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const requirePackage = createRequire(path.join(root, "package.json"));

const ts = requirePackage("typescript");

/** Real packages a module under test may use as they are. */
const REAL_PACKAGES = new Set(["tz-lookup", "node:crypto", "node:async_hooks"]);

/**
 * A stand-in for the ProviderUsage collection, so lib/provider-budget runs for
 * real in tests: counts are kept in memory instead of in MongoDB.
 */
export function createUsageStore() {
  const counts = new Map();

  return {
    counts,
    findOneAndUpdate({ provider, day }, update) {
      const key = `${provider}:${day}`;
      const count = (counts.get(key) ?? 0) + update.$inc.count;
      counts.set(key, count);
      return { lean: async () => ({ provider, day, count }) };
    },
  };
}

const sharedUsageStore = createUsageStore();

export function load(relativePath, mocks = {}, extra = "") {
  const filename = path.join(root, relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8") + extra, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };

  new Function("require", "module", "exports", code)(
    (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "server-only") return {};
      if (REAL_PACKAGES.has(id)) return requirePackage(id);
      // The daily provider budget is the real module over an in-memory
      // counter, unless a test supplies its own.
      if (id === "@/lib/provider-budget") {
        return load("lib/provider-budget.ts", {
          "@/lib/mongodb": async () => {},
          "@/models/ProviderUsage": sharedUsageStore,
        });
      }
      if (id.startsWith("@/lib/")) return load(id.slice(2) + ".ts", mocks);
      throw new Error(`Unexpected import: ${id}`);
    },
    loadedModule,
    loadedModule.exports,
  );

  return loadedModule.exports;
}
