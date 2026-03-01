import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionToggle } from '../PermissionToggle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderToggle(props?: Partial<Parameters<typeof PermissionToggle>[0]>) {
  const onChange = jest.fn();
  const utils = render(
    <PermissionToggle
      label="Feature access"
      enabled={false}
      onChange={onChange}
      {...props}
    />
  );
  return { ...utils, onChange };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('PermissionToggle – rendering', () => {
  it('renders a switch button', () => {
    renderToggle();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('uses the provided label as aria-label', () => {
    renderToggle({ label: 'Owner feature access' });
    expect(screen.getByRole('switch', { name: 'Owner feature access' })).toBeInTheDocument();
  });

  it('has aria-checked="false" when disabled=false (semantically OFF)', () => {
    renderToggle({ enabled: false });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('has aria-checked="true" when enabled=true (semantically ON)', () => {
    renderToggle({ enabled: true });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('is not disabled by default', () => {
    renderToggle();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    renderToggle({ disabled: true });
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

describe('PermissionToggle – interaction', () => {
  it('calls onChange with true when toggled from OFF to ON', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: false });

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when toggled from ON to OFF', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: true });

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not call onChange when the toggle is disabled', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ disabled: true });

    await user.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('is keyboard-accessible via Enter key', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: false });

    screen.getByRole('switch').focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is keyboard-accessible via Space key', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: false });

    screen.getByRole('switch').focus();
    await user.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('receives focus when tabbing through the page', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// Visual state (thumb position class)
// ---------------------------------------------------------------------------

describe('PermissionToggle – visual state', () => {
  it('applies translate-x-5 class to thumb when enabled', () => {
    renderToggle({ enabled: true });
    const thumb = screen.getByRole('switch').querySelector('span');
    expect(thumb).toHaveClass('translate-x-5');
  });

  it('applies translate-x-1 class to thumb when not enabled', () => {
    renderToggle({ enabled: false });
    const thumb = screen.getByRole('switch').querySelector('span');
    expect(thumb).toHaveClass('translate-x-1');
  });
});

// ---------------------------------------------------------------------------
// Two-layer API
// ---------------------------------------------------------------------------

function renderTwoLayer(props?: Partial<Parameters<typeof PermissionToggle>[0]>) {
  const onFeatureChange = jest.fn();
  const onSettingsChange = jest.fn();
  const utils = render(
    <PermissionToggle
      featureEnabled={false}
      settingsEnabled={false}
      onFeatureChange={onFeatureChange}
      onSettingsChange={onSettingsChange}
      {...props}
    />
  );
  return { ...utils, onFeatureChange, onSettingsChange };
}

describe('PermissionToggle – two-layer rendering', () => {
  it('renders Feature Access and Settings Access switches', () => {
    renderTwoLayer();
    expect(screen.getByRole('switch', { name: 'Feature Access' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Settings Access' })).toBeInTheDocument();
  });

  it('hides Settings Access switch when hasSettings is false', () => {
    renderTwoLayer({ hasSettings: false });
    expect(screen.queryByRole('switch', { name: 'Settings Access' })).not.toBeInTheDocument();
  });

  it('reflects featureEnabled on Feature Access switch', () => {
    renderTwoLayer({ featureEnabled: true });
    expect(screen.getByRole('switch', { name: 'Feature Access' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables Settings Access switch when featureEnabled is false', () => {
    renderTwoLayer({ featureEnabled: false });
    expect(screen.getByRole('switch', { name: 'Settings Access' })).toBeDisabled();
  });

  it('enables Settings Access switch when featureEnabled is true', () => {
    renderTwoLayer({ featureEnabled: true, settingsEnabled: false });
    expect(screen.getByRole('switch', { name: 'Settings Access' })).not.toBeDisabled();
  });

  it('shows Settings as OFF when featureEnabled is false, regardless of settingsEnabled', () => {
    renderTwoLayer({ featureEnabled: false, settingsEnabled: true });
    expect(screen.getByRole('switch', { name: 'Settings Access' })).toHaveAttribute('aria-checked', 'false');
  });

  it('disables both switches when disabled prop is true', () => {
    renderTwoLayer({ featureEnabled: true, settingsEnabled: true, disabled: true });
    expect(screen.getByRole('switch', { name: 'Feature Access' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Settings Access' })).toBeDisabled();
  });
});

describe('PermissionToggle – two-layer interaction', () => {
  it('calls onFeatureChange(true) when Feature toggled from OFF to ON', async () => {
    const user = userEvent.setup();
    const { onFeatureChange } = renderTwoLayer({ featureEnabled: false });

    await user.click(screen.getByRole('switch', { name: 'Feature Access' }));

    expect(onFeatureChange).toHaveBeenCalledTimes(1);
    expect(onFeatureChange).toHaveBeenCalledWith(true);
  });

  it('calls onFeatureChange(false) when Feature toggled from ON to OFF (no warning)', async () => {
    const user = userEvent.setup();
    const { onFeatureChange } = renderTwoLayer({
      featureEnabled: true,
      featureWarningInfo: null,
    });

    await user.click(screen.getByRole('switch', { name: 'Feature Access' }));

    expect(onFeatureChange).toHaveBeenCalledWith(false);
  });

  it('calls onSettingsChange(true) when Settings toggled from OFF to ON', async () => {
    const user = userEvent.setup();
    const { onSettingsChange } = renderTwoLayer({
      featureEnabled: true,
      settingsEnabled: false,
    });

    await user.click(screen.getByRole('switch', { name: 'Settings Access' }));

    expect(onSettingsChange).toHaveBeenCalledWith(true);
  });

  it('does not call onSettingsChange when featureEnabled is false', async () => {
    const user = userEvent.setup();
    const { onSettingsChange } = renderTwoLayer({
      featureEnabled: false,
    });

    await user.click(screen.getByRole('switch', { name: 'Settings Access' }));

    expect(onSettingsChange).not.toHaveBeenCalled();
  });
});
