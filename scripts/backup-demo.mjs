import { setServers } from "node:dns";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { exportDatabase, verifyBackup } from "./support/demo-backup.mjs";

const [mode, suppliedPath] = process.argv.slice(2);
if (!["export", "verify"].includes(mode) || (mode === "verify" && !suppliedPath)) {
  console.error("Usage: node --env-file=.env scripts/backup-demo.mjs export [archive.ndjson.gz] | verify archive.ndjson.gz");
  process.exitCode = 1;
} else {
  let client;
  let session;
  let stage = "configuration";
  try {
    const filename = resolve(suppliedPath ?? `backups/demo-${new Date().toISOString().replaceAll(":", "-")}.ndjson.gz`);
    if (mode === "verify") {
      console.info(JSON.stringify({ event: "backup_verified", ...(await verifyBackup(filename)) }));
    } else {
      if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
      // Match the app’s development-only Atlas SRV resolver workaround.
      if (process.env.NODE_ENV !== "production" && process.env.MONGODB_URI.startsWith("mongodb+srv://")) {
        setServers(["1.1.1.1", "8.8.8.8"]);
      }
      client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
      stage = "connect";
      await client.connect();
      session = client.startSession({ snapshot: true });
      stage = "export";
      const report = await exportDatabase(client.db(process.env.MONGODB_DB ?? "nobojatra"), filename, session);
      console.info(JSON.stringify({ event: "backup_complete", filename, ...report }));
    }
  } catch (error) {
    // Driver errors can contain the connection URL or host details.
    const safeCodes = ["ENOTFOUND", "ECONNREFUSED", "EACCES", "EPERM", "ETIMEDOUT", "ECONNRESET"];
    const code = typeof error.code === "number" || safeCodes.includes(error.code) ? error.code : "unknown";
    console.error(JSON.stringify({ event: "backup_failed", stage, code }));
    console.error("No successful backup is claimed. Check database access, snapshot support and the destination.");
    process.exitCode = 1;
  } finally {
    await session?.endSession();
    await client?.close();
  }
}
