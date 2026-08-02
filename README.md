# NoboJatra

NoboJatra is a Next.js travel planner app with Better Auth, MongoDB, route/traffic APIs, and password reset emails through Resend.

## Setup

Install dependencies, then run the dev server:

```bash
pnpm install
pnpm dev
```

If package managers are not available but `node_modules` already exists:

```bash
./node_modules/.bin/next dev
```

Open `http://localhost:3000`.

## Environment

Create/update `.env` with:

```env
MONGODB_URI=your_mongodb_connection_string
BETTER_AUTH_SECRET=your_auth_secret
BETTER_AUTH_URL=http://localhost:3000
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=NoboJatra <your_verified_sender@yourdomain.com>
ORS_API_KEY=your_openrouteservice_api_key
```

`RESEND_FROM_EMAIL` must be a sender/domain verified in Resend. For quick Resend sandbox testing, `NoboJatra <onboarding@resend.dev>` can work only with Resend's allowed test-recipient rules.

`ORS_API_KEY` is used only by backend route APIs. Do not expose it as `NEXT_PUBLIC_ORS_API_KEY`.

## Testing Password Reset Email

1. Start the app:

```bash
pnpm dev
```

If package managers are not available but `node_modules` exists:

```bash
./node_modules/.bin/next dev
```

2. Open `http://localhost:3000/forgot-password`.
3. Enter the email of an existing account.
4. Check the inbox for the Resend email.
5. Open the reset link and set a new password.

The reset link expires after 1 hour. New passwords must be at least 8 characters and include at least one number.

## Auth Features

- Email/password signup and signin
- Server-side duplicate email error
- Password rule: at least 8 characters and at least one number
- Forgot password flow at `/forgot-password`
- Reset password flow at `/reset-password`
- One-hour reset tokens
- Existing sessions are revoked after password reset

## Checks

```bash
./node_modules/.bin/eslint
./node_modules/.bin/next build
```
