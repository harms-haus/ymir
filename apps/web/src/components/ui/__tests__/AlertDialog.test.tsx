import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertDialog, AlertDialogVariant } from '../AlertDialog';

describe('AlertDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    mockOnConfirm.mockClear();
    mockOnCancel.mockClear();
    mockOnOpenChange.mockClear();
  });

  const defaultProps = {
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    confirmLabel: 'Confirm',
    onConfirm: mockOnConfirm,
    open: true,
    onOpenChange: mockOnOpenChange,
  };

  it('should render nothing when open is false', () => {
    render(<AlertDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('should render title and description when open', () => {
    render(<AlertDialog {...defaultProps} />);

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('should render confirm button with custom label', () => {
    render(<AlertDialog {...defaultProps} confirmLabel="Delete" />);

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should render cancel button with default label', () => {
    render(<AlertDialog {...defaultProps} />);

    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render cancel button with custom label', () => {
    render(<AlertDialog {...defaultProps} cancelLabel="Go Back" />);

    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    render(<AlertDialog {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(<AlertDialog {...defaultProps} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should call onCancel when escape key is pressed', () => {
    render(<AlertDialog {...defaultProps} onCancel={mockOnCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should not call onCancel when escape key is pressed if onCancel not provided', () => {
    render(<AlertDialog {...defaultProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockOnCancel).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should render default variant icon (question)', () => {
    render(<AlertDialog {...defaultProps} variant="default" />);

    const icon = document.querySelector('.ri-question-line');
    expect(icon).toBeInTheDocument();
  });

  it('should render destructive variant icon (alert)', () => {
    render(<AlertDialog {...defaultProps} variant="destructive" />);

    const icon = document.querySelector('.ri-alert-line');
    expect(icon).toBeInTheDocument();
  });

 it('should apply default variant styling to confirm button', () => {
 render(<AlertDialog {...defaultProps} variant="default" />);

 const confirmButton = screen.getByText('Confirm');
 expect(confirmButton).toHaveClass('alert-dialog-confirm-default');
 });

 it('should apply destructive variant styling to confirm button', () => {
 render(<AlertDialog {...defaultProps} variant="destructive" />);

 const confirmButton = screen.getByText('Confirm');
 expect(confirmButton).toHaveClass('alert-dialog-confirm-destructive');
 });

  it('should default to default variant when variant not specified', () => {
    render(<AlertDialog {...defaultProps} />);

    const icon = document.querySelector('.ri-question-line');
    expect(icon).toBeInTheDocument();
  });

  it('should render backdrop overlay', () => {
    render(<AlertDialog {...defaultProps} />);

    const backdrop = document.querySelector('[style*="background-color: rgba(0, 0, 0, 0.5)"]');
    expect(backdrop).not.toBeNull();
  });

  it('should have correct accessibility attributes', () => {
    render(<AlertDialog {...defaultProps} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should render title with correct styling', () => {
    render(<AlertDialog {...defaultProps} />);

    const title = screen.getByText('Confirm Action');
    expect(title.tagName).toBe('H2');
  });

  it('should close dialog after confirm', () => {
    render(<AlertDialog {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should close dialog after cancel', () => {
    render(<AlertDialog {...defaultProps} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});