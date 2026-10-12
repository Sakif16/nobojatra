import { createReadStream } from "node:fs";
import { mkdir, open, link, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { createGzip, createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { BSON } from "mongodb";

export async function verifyBackup(filename) {
  const digest = createHash("sha256");
  const input = createReadStream(filename);
  input.on("data", (data) => digest.update(data));
  const unzip = createGunzip();
  input.on("error", (error) => unzip.destroy(error));
  input.pipe(unzip);
  let header = null;
  let footer = null;
  const counts = Object.create(null);
  for await (const line of createInterface({ input: unzip, crlfDelay: Infinity })) {
    const record = BSON.EJSON.parse(line, { relaxed: true });
    if (footer) throw new Error("Data follows the backup footer.");
    if (!header) {
      if (record.kind !== "header" || record.version !== 1) throw new Error("Unsupported backup format.");
      header = record;
    } else if (record.kind === "collection") {
      if (Object.hasOwn(counts, record.name)) throw new Error("Duplicate collection in backup.");
      counts[record.name] = 0;
    } else if (record.kind === "document") {
      if (!Object.hasOwn(counts, record.collection)) throw new Error("Unknown collection in backup.");
      counts[record.collection]++;
    } else if (record.kind === "footer") footer = record;
    else throw new Error("Invalid backup record.");
  }
  if (!header || !footer || JSON.stringify(counts) !== JSON.stringify(footer.counts)) {
    throw new Error("Backup is incomplete or document counts differ.");
  }
  return { database: header.database, collections: Object.keys(counts).length, documents: Object.values(counts).reduce((sum, count) => sum + count, 0), sha256: digest.digest("hex") };
}

/** Full BSON-preserving database export, including indexes and collection
 * options. Documents share a snapshot session; metadata changes must be paused.
 * No database writes, index creation or collection deletion occur here. */
export async function exportDatabase(db, filename, session) {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  if ((await stat(dirname(filename))).mode & 0o077) {
    throw new Error("Use a private backup directory (permissions 700).");
  }
  try { await stat(filename); throw new Error("Backup destination already exists."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${filename}.partial`;
  const file = await open(temporary, "wx", 0o600);
  const counts = Object.create(null);
  async function* records() {
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const encode = (record) => `${BSON.EJSON.stringify(record, { relaxed: false })}\n`;
    yield encode({ kind: "header", version: 1, database: db.databaseName, createdAt: new Date(), consistency: "snapshot-documents" });
    for (const collection of collections) {
      if (collection.name.startsWith("system.")) continue;
      if (collection.type !== "collection") throw new Error("Backup supports ordinary collections only; use MongoDB Database Tools for views or time-series data.");
      const source = db.collection(collection.name);
      const indexes = await source.listIndexes().toArray();
      counts[collection.name] = 0;
      yield encode({ kind: "collection", name: collection.name, options: collection.options, indexes });
      for await (const document of source.find({}, { session })) {
        yield encode({ kind: "document", collection: collection.name, document });
        counts[collection.name]++;
      }
    }
    yield encode({ kind: "footer", counts });
  }
  try {
    await pipeline(Readable.from(records()), createGzip(), file.createWriteStream());
    const report = await verifyBackup(temporary);
    // link is atomic and refuses an existing destination, even if another
    // process created it while this export was running.
    await link(temporary, filename);
    await rm(temporary);
    return report;
  } catch (error) {
    await file.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}
