import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Wording the app must not show: nothing here is a booking, and a fare band is
// not a quote. Each entry is a phrase that used to be on screen.
const BANNED = [
  [/\bbooked\b/i, "nothing is booked; a plan is saved"],
  [/confirmed (ride|trip)s?/i, "say saved plan"],
  [/trip (has been )?confirmed/i, "say plan saved"],
  [/is confirmed for/i, "say saved for"],
  [/Confirm(ing…| a ride| \$\{)/, "the button saves a plan"],
  [/confirm this (ride|trip)/i, "say save this plan"],
  [/vehicle confirmed/i, "say vehicle chosen"],
  [/\bsmarter\b/i, "describe what the app does instead"],
  [/re-checked every 15 minutes/i, "checks only run while the app is open"],
  [/know the fare/i, "fares are estimates"],
];

function sourceFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

// Comments explain history and may name the old wording; only code is checked.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("the app does not describe a saved plan as a booking or a confirmed ride", () => {
  const findings = [];

  for (const file of ["app", "components", "lib"].flatMap(sourceFiles)) {
    const lines = withoutComments(fs.readFileSync(path.join(root, file), "utf8")).split("\n");

    lines.forEach((line, index) => {
      for (const [pattern, advice] of BANNED) {
        if (pattern.test(line)) findings.push(`${file}:${index + 1} ${pattern} — ${advice}`);
      }
    });
  }

  assert.deepEqual(findings, []);
});
