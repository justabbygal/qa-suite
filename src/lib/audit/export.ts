export interface AuditLog {
  id: string;
  organization_id: string;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string | null;
  changes: Record<string, { before: unknown; after: unknown }> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditExportFilters {
  organization_id?: string;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export const CSV_HEADERS = [
  "ID",
  "Timestamp",
  "Actor Email",
  "Actor Name",
  "Action",
  "Resource Type",
  "Resource ID",
  "Resource Name",
  "Changes",
  "IP Address",
  "User Agent",
];

/**
 * Escapes a value for safe inclusion in a CSV field.
 * Wraps in double-quotes and escapes internal quotes when the value
 * contains commas, double-quotes, or newlines.
 */
export function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts a single audit log row into a CSV line (without trailing newline). */
export function auditLogToCSVRow(log: AuditLog): string {
  const fields: unknown[] = [
    log.id,
    log.created_at,
    log.actor_email,
    log.actor_name,
    log.action,
    log.resource_type,
    log.resource_id,
    log.resource_name,
    log.changes,
    log.ip_address,
    log.user_agent,
  ];
  return fields.map(escapeCSVField).join(",");
}

/** Generates a timestamped filename for the export file. */
export function generateCSVFilename(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  return `audit-logs-${timestamp}.csv`;
}
