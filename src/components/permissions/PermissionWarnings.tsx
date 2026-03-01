import { TriangleAlert } from 'lucide-react';

export interface PermissionWarningsProps {
  impacts: string[];
}

/**
 * Displays the list of consequences for a destructive permission change.
 * Intended to be rendered inside a ConfirmationDialog.
 */
export function PermissionWarnings({ impacts }: PermissionWarningsProps) {
  if (impacts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Permission change impacts"
      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
    >
      <div className="mb-2 flex items-center gap-2 font-medium text-destructive">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>What will change:</span>
      </div>
      <ul className="space-y-1 text-destructive/80" aria-label="Impacts">
        {impacts.map((impact, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0" aria-hidden="true">•</span>
            <span>{impact}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
