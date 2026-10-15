import React from 'react';

export type BadgeVariant = 'default' | 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'muted';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantClasses: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
    default: {
      bg: 'bg-surface-hover border border-border',
      text: 'text-text-primary',
      dot: 'bg-text-muted',
    },
    neutral: {
      bg: 'bg-surface-hover border border-border',
      text: 'text-text-primary',
      dot: 'bg-text-muted',
    },
    accent: {
      bg: 'bg-accent/10 border border-accent/20',
      text: 'text-accent',
      dot: 'bg-accent',
    },
    success: {
      bg: 'bg-success-surface border border-success/20',
      text: 'text-success',
      dot: 'bg-success',
    },
    danger: {
      bg: 'bg-danger-surface border border-danger/20',
      text: 'text-danger',
      dot: 'bg-danger',
    },
    warning: {
      bg: 'bg-warning-surface border border-warning/20',
      text: 'text-warning',
      dot: 'bg-warning',
    },
    muted: {
      bg: 'bg-surface-active/50 border border-border',
      text: 'text-text-muted',
      dot: 'bg-text-muted',
    },
  };

  const currentVariant = variantClasses[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-0.5'
      } ${currentVariant.bg} ${currentVariant.text} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${currentVariant.dot}`} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
