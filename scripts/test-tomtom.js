/**
 * Manual smoke test for the TomTom Matrix Routing API.
 *
 *   node --env-file=.env scripts/test-tomtom.js     (or: pnpm test:tomtom)
 *
 * Sends one bounded live-traffic matrix request between two Dhaka points and
 * prints the status and a truncated body. Useful for checking that a key is
 * valid and entitled before debugging the app's traffic path.
 *
 * The key is read from the environment and must never be inlined here — this
 * file previously carried a literal key, which reached GitHub and had to be
 * rotated. See CODEBASE_GAP_ANALYSIS.md P0-1.
 */
const key = process.env.TOMTOM_API_KEY;

if (!key) {
  console.error(
    "TOMTOM_API_KEY is not set.\n" +
      "Run with: node --env-file=.env scripts/test-tomtom.js\n" +
      "or export the key first: TOMTOM_API_KEY=... node scripts/test-tomtom.js",
  );
  process.exit(1);
}

(async () => {
  try {
    const res = await fetch(`https://api.tomtom.com/routing/matrix/2?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origins: [{ point: { latitude: 23.7808875, longitude: 90.2792371 } }],
        destinations: [{ point: { latitude: 23.8103, longitude: 90.4125 } }],
        options: { departAt: new Date().toISOString(), routeType: 'fastest', traffic: 'live' },
      }),
    });

    console.log('STATUS', res.status);
    const text = await res.text();
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
