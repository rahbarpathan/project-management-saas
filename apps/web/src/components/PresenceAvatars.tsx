import { PresenceUser } from '@sprintflow/shared';
import { Avatar } from './ui/Avatar';

export interface PresenceAvatarsProps {
  users: PresenceUser[];
  max?: number;
  className?: string;
}

export function PresenceAvatars({ users, max = 5, className = '' }: PresenceAvatarsProps) {
  if (!users || users.length === 0) {
    return null;
  }

  const visibleUsers = users.slice(0, max);
  const remainingCount = users.length - max;

  return (
    <div
      className={`flex items-center -space-x-1.5 overflow-hidden py-0.5 ${className}`}
      aria-label="Users currently viewing this project"
      title={`${users.length} user${users.length === 1 ? '' : 's'} viewing this project`}
      data-testid="presence-avatars"
    >
      {visibleUsers.map((user) => (
        <div
          key={user.id}
          className="relative inline-block rounded-full ring-2 ring-surface transition-transform hover:scale-110 hover:z-10"
          title={`${user.name} (${user.email})`}
        >
          <Avatar
            name={user.name}
            src={user.avatarUrl}
            size="xs"
          />
        </div>
      ))}

      {remainingCount > 0 && (
        <div
          className="relative inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-surface bg-surface-hover border border-border text-[10px] font-medium text-text-secondary select-none"
          title={`${remainingCount} more user${remainingCount === 1 ? '' : 's'}`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
