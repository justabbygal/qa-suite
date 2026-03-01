import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleCard } from '../ModuleCard';
import { makeRegisteredModule } from '@/lib/modules/__tests__/testUtils';

function renderCard(props?: Partial<Parameters<typeof ModuleCard>[0]>) {
  const onEdit = jest.fn();
  const onDeregister = jest.fn();
  const module = makeRegisteredModule();
  const utils = render(
    <ModuleCard module={module} onEdit={onEdit} onDeregister={onDeregister} {...props} />
  );
  return { ...utils, onEdit, onDeregister, module };
}

describe('ModuleCard – rendering', () => {
  it('displays the module displayName as a heading', () => {
    const module = makeRegisteredModule({ displayName: 'Integrations Engine' });
    render(<ModuleCard module={module} />);
    expect(screen.getByRole('heading', { name: 'Integrations Engine' })).toBeInTheDocument();
  });

  it('displays the module identifier', () => {
    const module = makeRegisteredModule({ module: 'integrations-engine' });
    render(<ModuleCard module={module} />);
    expect(screen.getByText('integrations-engine')).toBeInTheDocument();
  });

  it('shows "Yes" for hasSettings when true', () => {
    render(<ModuleCard module={makeRegisteredModule({ hasSettings: true })} />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows "No" for hasSettings when false', () => {
    render(<ModuleCard module={makeRegisteredModule({ hasSettings: false })} />);
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders an Edit button when onEdit is provided', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('renders a Deregister button when onDeregister is provided', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /deregister/i })).toBeInTheDocument();
  });

  it('does not render action buttons when no handlers are provided', () => {
    render(<ModuleCard module={makeRegisteredModule()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render Deregister button when only onEdit is provided', () => {
    render(<ModuleCard module={makeRegisteredModule()} onEdit={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /deregister/i })).not.toBeInTheDocument();
  });

  it('does not render Edit button when only onDeregister is provided', () => {
    render(<ModuleCard module={makeRegisteredModule()} onDeregister={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});

describe('ModuleCard – accessibility', () => {
  it('Edit button has an accessible name that includes the module name', () => {
    const module = makeRegisteredModule({ displayName: 'My Module' });
    render(<ModuleCard module={module} onEdit={jest.fn()} />);
    expect(screen.getByRole('button', { name: /edit my module/i })).toBeInTheDocument();
  });

  it('Deregister button has an accessible name that includes the module name', () => {
    const module = makeRegisteredModule({ displayName: 'My Module' });
    render(<ModuleCard module={module} onDeregister={jest.fn()} />);
    expect(screen.getByRole('button', { name: /deregister my module/i })).toBeInTheDocument();
  });
});

describe('ModuleCard – interaction', () => {
  it('calls onEdit with the module object when Edit is clicked', async () => {
    const user = userEvent.setup();
    const { onEdit, module } = renderCard();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(module);
  });

  it('calls onDeregister with the module id when Deregister is clicked', async () => {
    const user = userEvent.setup();
    const { onDeregister, module } = renderCard();
    await user.click(screen.getByRole('button', { name: /deregister/i }));
    expect(onDeregister).toHaveBeenCalledTimes(1);
    expect(onDeregister).toHaveBeenCalledWith(module.id);
  });

  it('does not call onDeregister when Edit is clicked', async () => {
    const user = userEvent.setup();
    const { onDeregister } = renderCard();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onDeregister).not.toHaveBeenCalled();
  });

  it('does not call onEdit when Deregister is clicked', async () => {
    const user = userEvent.setup();
    const { onEdit } = renderCard();
    await user.click(screen.getByRole('button', { name: /deregister/i }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
