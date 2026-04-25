/**
 * Modal — smoke tests covering open/close, backdrop click, Escape key,
 * and that a click inside the panel does NOT close the modal.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/ui/Modal.test.tsx`
 * verbatim. Path moved from co-located to centralized `tests/unit/` to
 * match the monorepo's vitest layout (the data-browser used Vite +
 * co-located tests; we use Next 16 + a single tests/unit/ tree).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hello">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByTestId('modal-panel')).toBeNull();
  });

  it('renders title, description, and body when open=true', () => {
    render(
      <Modal open onClose={() => {}} title="Hello" description="Sub">
        <p>inner body</p>
      </Modal>,
    );
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Hello');
    expect(screen.getByTestId('modal-description')).toHaveTextContent('Sub');
    expect(screen.getByText('inner body')).toBeInTheDocument();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on panel click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId('modal-panel'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on close-button click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
