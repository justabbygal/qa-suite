import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionToggle } from '../PermissionToggle';
import type { WarningInfo } from '@/lib/utils/permission-warnings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WARNING: WarningInfo = {
  title: 'Remove access?',
  description: 'This will remove access for the role.',
};

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

  it('has aria-checked="false" when enabled=false', () => {
    renderToggle({ enabled: false });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('has aria-checked="true" when enabled=true', () => {
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

  it('does not render a dialog by default', () => {
    renderToggle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interaction – without warningInfo (direct toggle)
// ---------------------------------------------------------------------------

describe('PermissionToggle – direct toggle (no warningInfo)', () => {
  it('calls onChange with true when toggled from OFF to ON', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: false });

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when toggled from ON to OFF (no confirmation needed)', async () => {
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
// Interaction – with warningInfo (confirmation dialog for destructive changes)
// ---------------------------------------------------------------------------

describe('PermissionToggle – confirmation dialog', () => {
  it('shows a confirmation dialog when disabling an enabled toggle with warningInfo', async () => {
    const user = userEvent.setup();
    renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does NOT call onChange immediately when a dialog is shown', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange(false) after confirming the destructive change', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /confirm change/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('closes the dialog and does NOT call onChange when the user cancels', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /cancel change/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT show a dialog when enabling a disabled toggle (not destructive)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: false, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does NOT show a dialog when disabling but warningInfo is null', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ enabled: true, warningInfo: null });

    await user.click(screen.getByRole('switch'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('displays the warning title and description in the dialog', async () => {
    const user = userEvent.setup();
    renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));

    expect(screen.getByText(WARNING.title)).toBeInTheDocument();
    expect(screen.getByText(WARNING.description)).toBeInTheDocument();
  });

  it('dialog is accessible with aria-modal attribute', async () => {
    const user = userEvent.setup();
    renderToggle({ enabled: true, warningInfo: WARNING });

    await user.click(screen.getByRole('switch'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
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
