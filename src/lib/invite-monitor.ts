/**
 * Lightweight in-process monitor for the invite system.
 *
 * Tracks success/failure counters and exposes a health check that flags
 * degraded conditions (high email failure rate, frequent rate-limit hits, etc.).
 *
 * NOTE: Counters reset on process restart. For persistent metrics, emit these
 * events to an external observability platform (e.g. Datadog, Axiom, Sentry).
 */

export interface InviteMetrics {
  invitesSent: number;
  invitesAccepted: number;
  invitesFailed: number;
  emailsSent: number;
  emailsFailed: number;
  rateLimitHits: number;
  lastUpdated: string;
}

export interface HealthStatus {
  healthy: boolean;
  issues: string[];
  metrics: InviteMetrics;
  timestamp: string;
}

class InviteMonitor {
  private metrics: InviteMetrics = {
    invitesSent: 0,
    invitesAccepted: 0,
    invitesFailed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    rateLimitHits: 0,
    lastUpdated: new Date().toISOString(),
  };

  // ---------------------------------------------------------------------------
  // Event recorders
  // ---------------------------------------------------------------------------

  recordInviteSent(): void {
    this.metrics.invitesSent++;
    this.touch();
    this.emit("invite_sent");
  }

  recordInviteAccepted(): void {
    this.metrics.invitesAccepted++;
    this.touch();
    this.emit("invite_accepted");
  }

  recordInviteFailed(reason: string): void {
    this.metrics.invitesFailed++;
    this.touch();
    this.emit("invite_failed", { reason });
  }

  recordEmailSent(): void {
    this.metrics.emailsSent++;
    this.touch();
    this.emit("email_sent");
  }

  recordEmailFailed(error: string): void {
    this.metrics.emailsFailed++;
    this.touch();
    this.emit("email_failed", { error });
  }

  recordRateLimitHit(userId: string): void {
    this.metrics.rateLimitHits++;
    this.touch();
    this.emit("rate_limit_hit", { userId });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getMetrics(): InviteMetrics {
    return { ...this.metrics };
  }

  getHealth(): HealthStatus {
    const issues: string[] = [];

    // Flag if >10 % of sent emails fail (only meaningful after a minimum sample)
    if (this.metrics.emailsSent >= 10) {
      const failRate = this.metrics.emailsFailed / this.metrics.emailsSent;
      if (failRate > 0.1) {
        issues.push(
          `High email failure rate: ${this.metrics.emailsFailed}/${this.metrics.emailsSent} (${Math.round(failRate * 100)}%)`
        );
      }
    }

    // Flag if >5 % of invite creation attempts fail
    if (this.metrics.invitesSent >= 10) {
      const failRate = this.metrics.invitesFailed / this.metrics.invitesSent;
      if (failRate > 0.05) {
        issues.push(
          `High invite failure rate: ${this.metrics.invitesFailed}/${this.metrics.invitesSent} (${Math.round(failRate * 100)}%)`
        );
      }
    }

    // Flag sustained rate-limit pressure
    if (this.metrics.rateLimitHits > 50) {
      issues.push(
        `High rate limit hit count: ${this.metrics.rateLimitHits} — potential abuse or misconfigured client`
      );
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private touch(): void {
    this.metrics.lastUpdated = new Date().toISOString();
  }

  private emit(event: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        service: "invite-system",
        event,
        ...data,
      })
    );
  }
}

/** Singleton — imported directly by API routes. */
export const inviteMonitor = new InviteMonitor();
