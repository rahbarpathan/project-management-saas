import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceAvatars } from './PresenceAvatars';
import { PresenceUser } from '@sprintflow/shared';

describe('PresenceAvatars Component', () => {
  const mockUsers: PresenceUser[] = [
    { id: '1', name: 'Alice Smith', email: 'alice@example.com', avatarUrl: null },
    { id: '2', name: 'Bob Jones', email: 'bob@example.com', avatarUrl: null },
    { id: '3', name: 'Charlie Brown', email: 'charlie@example.com', avatarUrl: null },
  ];

  it('renders nothing when user list is empty', () => {
    const { container } = render(<PresenceAvatars users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders avatars for all users when length <= max', () => {
    render(<PresenceAvatars users={mockUsers} max={5} />);

    expect(screen.getByTestId('presence-avatars')).toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByText('BJ')).toBeInTheDocument();
    expect(screen.getByText('CB')).toBeInTheDocument();
  });

  it('renders +N counter when user list exceeds max', () => {
    render(<PresenceAvatars users={mockUsers} max={2} />);

    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByText('BJ')).toBeInTheDocument();
    expect(screen.queryByText('CB')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('includes proper accessible attributes and titles', () => {
    render(<PresenceAvatars users={mockUsers} />);

    const container = screen.getByTestId('presence-avatars');
    expect(container).toHaveAttribute('aria-label', 'Users currently viewing this project');
    expect(container).toHaveAttribute('title', '3 users viewing this project');
  });
});
