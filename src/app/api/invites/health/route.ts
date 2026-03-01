/**
 * GET /api/invites/health
 *
 * Returns invite-system health metrics. Intended for:
 *   - Internal monitoring dashboards
 *   - Alerting pipelines (non-2xx status when degraded)
 *   - Admin debugging
 *
 * Access control:
 *   - Requests with a valid x-internal-key header bypass user auth.
 *   - Otherwise a Bearer token is required (any authenticated user).
 */

import { NextRequest, NextResponse } from "next/server";
import { inviteMonitor } from "@/lib/invite-monitor";
import { UnauthorizedError, toInviteError } from "@/lib/errors/invite-errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const internalKey = request.headers.get("x-internal-key");
    const authHeader = request.headers.get("authorization");

    const isInternal =
      !!process.env.INTERNAL_API_KEY &&
      internalKey === process.env.INTERNAL_API_KEY;
    const isAuthenticated = authHeader?.startsWith("Bearer ");

    if (!isInternal && !isAuthenticated) {
      throw new UnauthorizedError();
    }

    const health = inviteMonitor.getHealth();

    return NextResponse.json(
      { data: health },
      { status: health.healthy ? 200 : 503 }
    );
  } catch (error) {
    const ie = toInviteError(error);
    return NextResponse.json(ie.toApiResponse(), { status: ie.httpStatus });
  }
}
