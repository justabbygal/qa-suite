'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ConfirmationDialog } from './ConfirmationDialog';
import { isDestructiveChange } from '@/lib/utils/permission-warnings';
import type { WarningInfo } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Internal toggle switch button — shared by both variants
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  enabled: boolean;
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}

function ToggleSwitch({
  enabled,
  label,
  disabled = false,
  pending = false,
  onClick,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-50',
        pending && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors pointer-events-none',
          enabled ? 'bg-primary' : 'bg-input'
        )}
      >
        <span
          className={cn(
            'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props — discriminated union: single-layer vs dual-layer
// ---------------------------------------------------------------------------

/**
 * Single-layer: one toggle controlling a single permission (e.g. feature access
 * for a specific role). Used when the caller renders the label separately.
 */
export interface SingleToggleProps {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  /** Renders a subtle opacity pulse while a save is in-flight. */
  pending?: boolean;
  onChange: (enabled: boolean) => void;
  /**
   * When provided and the change is destructive (disabling), a confirmation
   * dialog is shown before `onChange` fires. Pass `null` to skip the dialog.
   */
  warningInfo?: WarningInfo | null;
}

/**
 * Dual-layer: two toggles (Feature Access + optional Settings Access) for a
 * single role within a module. Renders its own labels inline.
 */
export interface DualToggleProps {
  featureEnabled: boolean;
  settingsEnabled: boolean;
  /** When false, the Settings Access row is not rendered. */
  hasSettings: boolean;
  disabled?: boolean;
  /** Renders a subtle opacity pulse while a save is in-flight. */
  pending?: boolean;
  onFeatureChange: (value: boolean) => void;
  onSettingsChange: (value: boolean) => void;
  featureWarningInfo?: WarningInfo | null;
  settingsWarningInfo?: WarningInfo | null;
}

export type PermissionToggleProps = SingleToggleProps | DualToggleProps;

function isDual(props: PermissionToggleProps): props is DualToggleProps {
  return 'featureEnabled' in props;
}

// ---------------------------------------------------------------------------
// Public component — delegates to the correct variant
// ---------------------------------------------------------------------------

export function PermissionToggle(props: PermissionToggleProps) {
  if (isDual(props)) {
    return <DualPermissionToggle {...props} />;
  }
  return <SinglePermissionToggle {...props} />;
}

// ---------------------------------------------------------------------------
// Single-layer implementation
// ---------------------------------------------------------------------------

function SinglePermissionToggle({
  label,
  enabled,
  disabled = false,
  pending = false,
  onChange,
  warningInfo,
}: SingleToggleProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  function handleClick() {
    const newValue = !enabled;
    if (isDestructiveChange(enabled, newValue) && warningInfo) {
      setDialogOpen(true);
      return;
    }
    onChange(newValue);
  }

  return (
    <>
      <ToggleSwitch
        enabled={enabled}
        label={label}
        disabled={disabled}
        pending={pending}
        onClick={handleClick}
      />
      {warningInfo && (
        <ConfirmationDialog
          open={dialogOpen}
          warning={warningInfo}
          onConfirm={() => {
            setDialogOpen(false);
            onChange(false);
          }}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Dual-layer implementation
// ---------------------------------------------------------------------------

function DualPermissionToggle({
  featureEnabled,
  settingsEnabled,
  hasSettings,
  disabled = false,
  pending = false,
  onFeatureChange,
  onSettingsChange,
  featureWarningInfo,
  settingsWarningInfo,
}: DualToggleProps) {
  const [featureDialogOpen, setFeatureDialogOpen] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);

  const settingsDisabled = disabled || !featureEnabled;

  function handleFeatureClick() {
    const newValue = !featureEnabled;
    if (isDestructiveChange(featureEnabled, newValue) && featureWarningInfo) {
      setFeatureDialogOpen(true);
      return;
    }
    onFeatureChange(newValue);
  }

  function handleSettingsClick() {
    const newValue = !settingsEnabled;
    if (isDestructiveChange(settingsEnabled, newValue) && settingsWarningInfo) {
      setSettingsDialogOpen(true);
      return;
    }
    onSettingsChange(newValue);
  }

  return (
    <div className="w-full space-y-1">
      {/* Feature Access row */}
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Feature Access</p>
          <p className="text-xs text-muted-foreground">Use this module</p>
        </div>
        <ToggleSwitch
          enabled={featureEnabled}
          label="Feature access"
          disabled={disabled}
          pending={pending}
          onClick={handleFeatureClick}
        />
      </div>

      {/* Settings Access row — only rendered when module has settings */}
      {hasSettings && (
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Settings Access</p>
            <p className="text-xs text-muted-foreground">Configure settings</p>
          </div>
          <ToggleSwitch
            enabled={settingsEnabled}
            label="Settings access"
            disabled={settingsDisabled}
            pending={pending}
            onClick={handleSettingsClick}
          />
        </div>
      )}

      {featureWarningInfo && (
        <ConfirmationDialog
          open={featureDialogOpen}
          warning={featureWarningInfo}
          onConfirm={() => {
            setFeatureDialogOpen(false);
            onFeatureChange(false);
          }}
          onCancel={() => setFeatureDialogOpen(false)}
        />
      )}

      {settingsWarningInfo && (
        <ConfirmationDialog
          open={settingsDialogOpen}
          warning={settingsWarningInfo}
          onConfirm={() => {
            setSettingsDialogOpen(false);
            onSettingsChange(false);
          }}
          onCancel={() => setSettingsDialogOpen(false)}
        />
      )}
    </div>
  );
}
