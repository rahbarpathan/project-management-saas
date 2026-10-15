import { useState } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses: Record<AvatarSize, string> = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const getInitials = (fullName?: string | null) => {
    if (!fullName) return '?';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || '';
    if (parts.length === 1) return first.substring(0, 2).toUpperCase();
    const last = parts[parts.length - 1] || '';
    return ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 border border-border bg-surface-hover font-semibold text-text-primary select-none ${sizeClasses[size]} ${className}`}
      aria-label={name ? `Avatar of ${name}` : 'User avatar'}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
