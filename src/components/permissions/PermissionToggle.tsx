'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ConfirmationDialog } from './ConfirmationDialog';
import { isDestructiveChange } from '@/lib/utils/permission-warnings';
import type { WarningInfo } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Internal primitives
// ---------------------------------------------------------------------------

/** Inline tooltip for ADHD-friendly contextual help. */
function Tooltip({ content }: { content: string }) {
  return (
    <span className="relative group/tooltip inline-flex">
      <span
        aria-label={`More info: ${content}`}
        className={cn(
          'inline-flex items-center justify-center h-4 w-4 rounded-full cursor-default select-none',
          'bg-muted text-muted-foreground text-[10px] font-bold',
          'hover:bg-muted/70 transition-colors'
        )}
      >
        ?
      </span>
      <span
        role="tooltip"
        className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
          'w-48 px-3 py-2 text-xs text-popover-foreground bg-popover',
          'border rounded-md shadow-md pointer-events-none',
          'invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100',
          'transition-opacity duration-150'
        )}
      >
        {content}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover" />
      </span>
    </span>
  );
}

/** Reusable switch knob shared between both rendering modes. */
function SwitchKnob({
  enabled,
  disabled,
  label,
  onClick,
  size = 'default',
}: {
  enabled: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: 'default' | 'sm';
}) {
  const isSmall = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        enabled ? 'bg-primary' : 'bg-input',
        disabled && 'cursor-not-allowed opacity-50',
        isSmall ? 'h-4 w-7' : 'h-5 w-9'
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform',
          isSmall
            ? cn('h-2.5 w-2.5', enabled ? 'translate-x-[14px]' : 'translate-x-[3px]')
            : cn('h-3 w-3', enabled ? 'translate-x-5' : 'translate-x-1')
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// PermissionToggleProps — unified interface supporting both APIs
// ---------------------------------------------------------------------------

export interface PermissionToggleProps {
  // -------------------------------------------------------------------------
  // Legacy single-switch API (backward compatible)
  // Rendered when `featureEnabled` is NOT supplied.
  // -------------------------------------------------------------------------
  label?: string;
  enabled?: boolean;
  onChange?: (enabled: boolean) => void;
  warningInfo?: WarningInfo | null;

  // -------------------------------------------------------------------------
  // Two-layer API (preferred)
  // Rendered when `featureEnabled` IS supplied. Shows Feature Access
  // (primary) and Settings Access (secondary) with visual hierarchy.
  // -------------------------------------------------------------------------
  /** Whether the feature (primary) access is enabled */
  featureEnabled?: boolean;
  /** Whether the settings (secondary) access is enabled */
  settingsEnabled?: boolean;
  /** Hide the Settings row when the module has no settings layer */
  hasSettings?: boolean;
  featureLabel?: string;
  settingsLabel?: string;
  featureTooltip?: string;
  settingsTooltip?: string;
  onFeatureChange?: (enabled: boolean) => void;
  onSettingsChange?: (enabled: boolean) => void;
  featureWarningInfo?: WarningInfo | null;
  settingsWarningInfo?: WarningInfo | null;

  // Shared
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// PermissionToggle
// ---------------------------------------------------------------------------

/**
 * Permission toggle component with two-layer design.
 *
 * **Two-layer mode** (preferred): pass `featureEnabled` + `settingsEnabled`.
 * Renders Feature Access (primary, prominent) and Settings Access (secondary,
 * indented) with clear visual hierarchy for ADHD-friendly scanning.
 * Settings Access is automatically disabled when Feature Access is off.
 *
 * **Legacy mode** (backward compatible): pass `label` + `enabled` + `onChange`.
 * Renders a single switch. Used by table-based layouts.
 */
export function PermissionToggle({
  label,
  enabled,
  onChange,
  warningInfo,
  featureEnabled,
  settingsEnabled = false,
  hasSettings = true,
  featureLabel = 'Feature Access',
  settingsLabel = 'Settings Access',
  featureTooltip = 'Controls whether this role can use this module at all.',
  settingsTooltip =
    "Controls whether this role can configure this module's settings. Requires Feature Access to be on.",
  onFeatureChange,
  onSettingsChange,
  featureWarningInfo,
  settingsWarningInfo,
  disabled = false,
}: PermissionToggleProps) {
  const [featureDialogOpen, setFeatureDialogOpen] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [legacyDialogOpen, setLegacyDialogOpen] = React.useState(false);

  // -------------------------------------------------------------------------
  // Legacy single-switch mode
  // -------------------------------------------------------------------------
  if (featureEnabled === undefined) {
    const isEnabled = enabled ?? false;

    function handleLegacyClick() {
      const newValue = !isEnabled;
      if (isDestructiveChange(isEnabled, newValue) && warningInfo) {
        setLegacyDialogOpen(true);
        return;
      }
      onChange?.(newValue);
    }

    return (
      <>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={label}
          disabled={disabled}
          onClick={handleLegacyClick}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isEnabled ? 'bg-primary' : 'bg-input',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <span
            className={cn(
              'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
              isEnabled ? 'translate-x-5' : 'translate-x-1'
            )}
          />
        </button>

        {warningInfo && (
          <ConfirmationDialog
            open={legacyDialogOpen}
            warning={warningInfo}
            onConfirm={() => {
              setLegacyDialogOpen(false);
              onChange?.(false);
            }}
            onCancel={() => setLegacyDialogOpen(false)}
          />
        )}
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Two-layer mode
  // -------------------------------------------------------------------------
  const settingsDisabled = disabled || !featureEnabled;
  const effectiveSettingsEnabled = featureEnabled && settingsEnabled;

  function handleFeatureClick() {
    const newValue = !featureEnabled;
    if (isDestructiveChange(featureEnabled, newValue) && featureWarningInfo) {
      setFeatureDialogOpen(true);
      return;
    }
    onFeatureChange?.(newValue);
  }

  function handleSettingsClick() {
    if (settingsDisabled) return;
    const newValue = !effectiveSettingsEnabled;
    if (isDestructiveChange(effectiveSettingsEnabled ?? false, newValue) && settingsWarningInfo) {
      setSettingsDialogOpen(true);
      return;
    }
    onSettingsChange?.(newValue);
  }

  return (
    <>
      <div className="space-y-2.5">
        {/* Feature Access — primary, prominent */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium leading-none">{featureLabel}</span>
            <Tooltip content={featureTooltip} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                'text-xs font-semibold tabular-nums w-6 text-right transition-colors',
                featureEnabled ? 'text-primary' : 'text-muted-foreground/60'
              )}
            >
              {featureEnabled ? 'ON' : 'OFF'}
            </span>
            <SwitchKnob
              enabled={featureEnabled}
              disabled={disabled}
              label={featureLabel}
              onClick={handleFeatureClick}
            />
          </div>
        </div>

        {/* Settings Access — secondary, visually subordinate */}
        {hasSettings && (
          <div
            className={cn(
              'flex items-center justify-between gap-3 pl-3 border-l-2 transition-colors',
              settingsDisabled ? 'border-border/30' : 'border-border/60'
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  'text-xs leading-none transition-colors',
                  settingsDisabled
                    ? 'text-muted-foreground/40'
                    : 'text-muted-foreground font-medium'
                )}
              >
                {settingsLabel}
              </span>
              <Tooltip content={settingsTooltip} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'text-xs tabular-nums w-6 text-right transition-colors',
                  !settingsDisabled && effectiveSettingsEnabled
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground/40'
                )}
              >
                {effectiveSettingsEnabled ? 'ON' : 'OFF'}
              </span>
              <SwitchKnob
                enabled={effectiveSettingsEnabled ?? false}
                disabled={settingsDisabled}
                label={settingsLabel}
                onClick={handleSettingsClick}
                size="sm"
              />
            </div>
          </div>
        )}
      </div>

      {featureWarningInfo && (
        <ConfirmationDialog
          open={featureDialogOpen}
          warning={featureWarningInfo}
          onConfirm={() => {
            setFeatureDialogOpen(false);
            onFeatureChange?.(false);
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
            onSettingsChange?.(false);
          }}
          onCancel={() => setSettingsDialogOpen(false)}
        />
      )}
    </>
  );
}
