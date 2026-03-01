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
