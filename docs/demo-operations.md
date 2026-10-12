# Demo security and data operations

These instructions cover one Node service with one MongoDB database. Source checks and offline integration tests do not certify the deployed service.

## Authentication

All sign-up, reset, change-password and server-side set-password requests require 8–128 characters and at least one number. Changing a password revokes other sessions; resetting it revokes all sessions. Both account-deletion entry points require the current password. The readable duplicate-email message remains deliberate: it reveals account existence, but its lookup is guarded by both the HTTP limit and an email-based limit.

The HTTP limits below are explicit and enabled in development too:

| Operation | Window | Maximum attempts |
| --- | --- | --- |
| Sign-up | 10 minutes | 5 |
| Sign-in / verify current password | 1 minute | 10 each |
| Request reset | 15 minutes | 3 |
| Submit reset | 15 minutes | 5 |
| Change password / delete account | 15 minutes | 5 each |

Additional limits, including calls through `auth.api`, use normalized email HMACs (sign-up: 5/10 minutes, sign-in: 10/10 minutes, request reset: 3/15 minutes) or user IDs hashed the same way (password change and deletion: 5/15 minutes; verify current password: 10/10 minutes). Counters contain no plaintext email addresses and are bounded in memory. Limits count successful and failed attempts. All counters reset on restart and are per process; keep one instance. Provider endpoints continue to limit by authenticated user ID.

Sessions expire after seven days, refresh at most once a day, and count as fresh for sensitive operations for 15 minutes. Cookie caching and cross-subdomain sharing are disabled. Cookies are HttpOnly, SameSite=Lax, and Secure in production or whenever the configured auth URL is HTTPS. Production must use its public HTTPS `BETTER_AUTH_URL`.

## Proxy review on the actual host

`AUTH_TRUSTED_IP_HEADER` is unset by default. Forwarding headers are ignored; Better Auth then applies shared per-path HTTP limits, in addition to the account-based limits. This conservative fallback can throttle different demo visitors together.

Only set the variable after confirming that the hosting proxy **overwrites** that header and the origin cannot be accessed around it. Supported values are `x-forwarded-for`, `x-real-ip` and `cf-connecting-ip`. The installed Better Auth rejects multi-value forwarded chains without trusted-proxy configuration, so an appending header will fall back to the shared bucket. Do not enable a header because its name looks familiar, or trust the leftmost value of an arbitrary chain. No proxy CIDRs are guessed by this app.

Run the read-only public checks:

```sh
node scripts/review-demo-host.mjs https://nobojatra.onrender.com
```

Then use a disposable account in a browser on the deployed host:

1. Inspect the login response and session cookie: Secure, HttpOnly, SameSite=Lax, Path=/, no broad Domain attribute.
2. Sign in in two browsers. Change the password in one; the other session should stop working. Reset the password; both sessions should stop working.
3. Sign out and check that the old cookie no longer grants access.
4. Confirm the proxy's overwrite/append behavior in the host settings. Try forged forwarding headers against a disposable account and confirm they cannot evade attempt limits. The public check script cannot perform this review.

On 11 October 2026, public `/signin` and `/api/auth/get-session` checks returned 200. HSTS, nosniff, frame protection and referrer policy were present, and the sign-in page had CSP. Neither response issued an authenticated cookie. Authenticated cookie/proxy settings remain unverified; local changes have not been deployed by this work.

## Back up before cleanup or schema changes

```sh
pnpm backup:demo
pnpm backup:verify backups/demo-<timestamp>.ndjson.gz
```

The export reads the configured `.env` database without writing to it. It includes auth and application collections, BSON types, collection options and indexes. Documents share a MongoDB snapshot session, requiring snapshot support (replica set or sharded deployment). Pause schema/index changes for the export. Views and time-series collections are refused; use MongoDB Database Tools for those.

Archives use gzip-compressed canonical Extended JSON records: header, collection metadata, documents and a footer with counts. Verification reads the entire compressed archive, parses each record and checks counts; it reports a SHA-256 digest. This is a custom export format, **not** a `mongorestore` archive. Restoring requires a BSON-aware importer: create collections from metadata, insert each `document` parsed with `BSON.EJSON.parse(..., { relaxed: false })`, then recreate the recorded indexes. Use a separate empty database first; a full restore drill is outside this demo task. MongoDB Database Tools are an alternative when a standard dump/restore format is needed.

The default directory is `backups/`, mode 700, and files are mode 600. Existing destinations are never overwritten; failed exports remove partial files. Custom output paths require a private parent directory. Backups are ignored by Git, but contain passwords hashes, sessions and personal data: keep them protected and retain a dated copy outside the disposable host, using encrypted storage. Record the verification digest alongside that copy.

The CLI uses the app's development-only public-DNS workaround for Atlas SRV resolution. Production keeps the host resolver. A live export succeeded on 11 October 2026 after earlier connection failures: `backups/demo-2026-10-11T16-28-01.243Z.ndjson.gz` contains 16 collections and 328 documents from `nobojatra`. Independent archive verification returned the same counts and SHA-256 `55905d29bb9efa0f65ed74680bd5fd8b9cd8c124b93c5adc1b3c6534ab9c7329`. Directory/file modes are 700/600, and Git ignores the archive. This confirms a readable export, not a completed restore test or an off-machine backup copy. Synthetic export, BSON preservation, permission, corruption and partial-file tests pass.

## Account deletion and legacy data

Better Auth owns auth-account deletion. Its shared `beforeDelete` hook removes user-owned alerts, saved trips, profile, places, trip history and route-linked traffic, plus legacy `tripinputrequests` and user-linked verification records. Owner routes are deleted last, after all dependent work has settled successfully, so a failed cleanup can still find traffic records on retry. An explicitly foreign-owned trip history record is never deleted just because its route reference matches.

Cleanup is idempotent but not a transaction across both database adapters: a failure may remove some application records while retaining the auth account for retry. Back up before bulk cleanup. Do not drop legacy collections or indexes just because a model is unused; inventory their records and references first. No live collection, index or schema was changed in this work.

Offline tests cover failure retries, deletion requiring a password, and foreign-owner reads/updates/deletes. Browser tests against two deployed accounts and the live legacy-data inventory remain outstanding.

## Failure visibility

Core planner responses include a server-generated `X-Request-ID`; unexpected failures return a generic error and that ID. Structured `feature_failure` logs identify the feature, provider, category and safe HTTP status. Logs never serialize request bodies, error messages/stacks, URLs, email addresses, credentials or upstream response text. Search host logs by the request ID.

Weather and traffic degradation and Pathao rate-card fallbacks log through the same reporter. Camera loading stops waiting after one minute, offers retry/external access, and reports only an allowlisted event to a signed-in endpoint capped at six reports per minute per account. Browser camera diagnostics describe an observed load failure, not proof that the provider is offline. An iframe load event cannot prove its videos work.
