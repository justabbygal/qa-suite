'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisteredModule } from '@/lib/modules/types';

export interface ModuleCardProps {
  module: RegisteredModule;
  onEdit?: (module: RegisteredModule) => void;
  onDeregister?: (moduleId: string) => void;
}

export function ModuleCard({ module, onEdit, onDeregister }: ModuleCardProps) {
  return (
    <Card aria-label={`${module.displayName} module`}>
      <CardHeader>
        <CardTitle>{module.displayName}</CardTitle>
        <p className="font-mono text-sm text-muted-foreground">{module.module}</p>
      </CardHeader>
      <CardContent>
        <dl className="text-sm">
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Has Settings:</dt>
            <dd className="font-medium">{module.hasSettings ? 'Yes' : 'No'}</dd>
          </div>
        </dl>

        {(onEdit || onDeregister) && (
          <div className="mt-4 flex gap-3">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(module)}
                aria-label={`Edit ${module.displayName}`}
                className="text-sm text-primary hover:underline"
              >
                Edit
              </button>
            )}
            {onDeregister && (
              <button
                type="button"
                onClick={() => onDeregister(module.id)}
                aria-label={`Deregister ${module.displayName}`}
                className="text-sm text-destructive hover:underline"
              >
                Deregister
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
