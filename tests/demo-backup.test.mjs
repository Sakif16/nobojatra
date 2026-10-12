import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { BSON } from "mongodb";
import { exportDatabase, verifyBackup } from "../scripts/support/demo-backup.mjs";

function fakeDatabase(fail = false) {
  const document = { _id: new BSON.ObjectId(), createdAt: new Date("2026-10-11T00:00:00Z"), counter: BSON.Long.fromString("9007199254740993"), passwordHash: "test-hash" };
  const session = { marker: "snapshot" };
  const db = {
    databaseName: "demo-test",
    listCollections: () => ({ toArray: async () => [{ name: "user", type: "collection", options: {} }] }),
    collection: () => ({
      listIndexes: () => ({ toArray: async () => [{ name: "_id_", key: { _id: 1 }, unique: true }] }),
      async *find(_query, options) { assert.equal(options.session, session); if (fail) throw new Error("injected read failure"); yield document; },
    }),
  };
  return { db, session, document };
}

test("backup preserves BSON, indexes and counts, restricts permissions and refuses overwrites", async () => {
  const directory = await mkdtemp(join(tmpdir(), "demo-backup-test-"));
  try {
    const file = join(directory, "test.ndjson.gz");
    const f = fakeDatabase();
    const report = await exportDatabase(f.db, file, f.session);
    assert.equal(report.documents, 1);
    assert.equal(report.collections, 1);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    const records = gunzipSync(await readFile(file)).toString().trim().split("\n").map((line) => BSON.EJSON.parse(line, { relaxed: false }));
    assert.equal(records[1].indexes[0].name, "_id_");
    assert.ok(records[2].document._id.equals(f.document._id));
    assert.equal(records[2].document.createdAt.toISOString(), f.document.createdAt.toISOString());
    assert.equal(records[2].document.counter.toString(), "9007199254740993");
    assert.equal((await verifyBackup(file)).sha256, report.sha256);
    await assert.rejects(exportDatabase(f.db, file, f.session), /already exists/);
    await writeFile(join(directory, "broken.gz"), gzipSync(records.slice(0, -1).map((record) => BSON.EJSON.stringify(record)).join("\n")), { mode: 0o600 });
    await assert.rejects(verifyBackup(join(directory, "broken.gz")), /incomplete/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed exports remove their partial file and never claim a complete backup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "demo-backup-test-"));
  const file = join(directory, "failed.gz");
  try {
    const f = fakeDatabase(true);
    await assert.rejects(exportDatabase(f.db, file, f.session), /injected/);
    await assert.rejects(stat(file), { code: "ENOENT" });
    await assert.rejects(stat(`${file}.partial`), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
