import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}
