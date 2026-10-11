import { Fragment, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface DialogContentProps {
  className?: string;
  children: ReactNode;
}

interface DialogHeaderProps {
  children: ReactNode;
}

interface DialogTitleProps {
  children: ReactNode;
}

interface DialogDescriptionProps {
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps): React.ReactNode {
  if (!open) return null;

  return createPortal(
    <Fragment>
      <div
        className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 animate-fadein"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadein"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </Fragment>,
    document.body,
  );
}

export function DialogContent({ className = '', children }: DialogContentProps) {
  return (
    <div className={`pl-card ${className}`}>
      {children}
    </div>
  );
}

export function DialogHeader({ children }: DialogHeaderProps) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: DialogTitleProps) {
  return <div className="pl-serif text-2xl font-bold tracking-tight leading-tight">{children}</div>;
}

export function DialogDescription({ children }: DialogDescriptionProps) {
  return <div className="text-gray-900/60 pl-serif italic text-sm mt-1">{children}</div>;
}