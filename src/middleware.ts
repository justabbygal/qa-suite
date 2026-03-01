import { NextRequest, NextResponse } from "next/server";
import { IP_RATE_LIMIT } from "@/lib/rate-limit";

/**
 * Next.js middleware — runs at the Edge before every matched request.
 *
 * Responsibilities:
 *  1. IP-level rate limiting on invite API routes (coarse guard against abuse).
 *     Per-user rate limiting (10 invites/hour) is enforced inside the route
 *     handlers themselves, where we have access to the authenticated user ID.
 *  2. Standard security response headers.
 *
 * NOTE: The in-memory store used here resets on every cold start.  For true
 * distributed rate limiting across Edge instances deploy an Upstash Redis store.
 */

// ---------------------------------------------------------------------------
// Tiny in-memory store (Edge-compatible — no Node.js globals required)
// ---------------------------------------------------------------------------

interface IpEntry {
  count: number;
  resetAt: number; // Unix ms
}

const ipStore = new Map<string, IpEntry>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkIpLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
} {
  const now = Date.now();

  // Purge expired entries to keep memory bounded
  for (const [k, v] of ipStore) {
    if (now > v.resetAt) ipStore.delete(k);
  }

  const entry = ipStore.get(ip);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + IP_RATE_LIMIT.windowMs;
    ipStore.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: IP_RATE_LIMIT.maxRequests - 1, resetAt };
  }

  if (entry.count >= IP_RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: IP_RATE_LIMIT.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ---------------------------------------------------------------------------
// Middleware handler
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest): NextResponse {
  const ip = getClientIp(request);
  const limit = checkIpLimit(ip);

  // Build shared rate-limit headers
  const rlHeaders: Record<string, string> = {
    "X-RateLimit-Limit": IP_RATE_LIMIT.maxRequests.toString(),
    "X-RateLimit-Remaining": limit.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(limit.resetAt / 1000).toString(),
  };

  if (!limit.allowed) {
    if (limit.retryAfter !== undefined) {
      rlHeaders["Retry-After"] = limit.retryAfter.toString();
    }

    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests from this IP address.",
          userMessage:
            "You are sending requests too quickly. Please slow down and try again.",
          retryable: true,
          retryAfter: limit.retryAfter,
        },
      },
      { status: 429, headers: rlHeaders }
    );
  }

  // Allow the request — attach rate-limit info and security headers
  const response = NextResponse.next();

  // Rate-limit telemetry
  for (const [k, v] of Object.entries(rlHeaders)) {
    response.headers.set(k, v);
  }

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  // Apply only to the invite API; adjust as more routes are added.
  matcher: ["/api/invites/:path*"],
};
