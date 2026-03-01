/**
 * Better Auth catch-all API route.
 *
 * Mounts all Better Auth endpoints under /api/auth/*, including:
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/session
 *   POST /api/auth/organization/create
 *   POST /api/auth/organization/invite-member
 *   POST /api/auth/organization/accept-invitation
 *   ... and other Better Auth built-in endpoints
 *
 * The existing POST /api/auth/signup route (custom owner bootstrap flow)
 * continues to work — Next.js routes specific paths before catch-alls.
 */

import { auth } from "@/lib/auth/config";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
