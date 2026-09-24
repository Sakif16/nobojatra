import { createAuthClient } from "better-auth/react"

// No baseURL: the client calls /api/auth on whatever origin serves the page,
// so the same build works locally and on Render. Set
// NEXT_PUBLIC_BETTER_AUTH_URL only if auth ever moves to a different origin.
export const authClient = createAuthClient()
