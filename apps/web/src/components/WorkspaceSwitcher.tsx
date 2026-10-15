import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role } from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { Badge, BadgeVariant } from './ui/Badge';
import { Spinner } from './ui/Spinner';

function getRoleBadgeVariant(role?: Role | null): BadgeVariant {
  switch (role) {
    case 'OWNER':
      return 'accent';
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'success';
    default:
      return 'neutral';
  }
}

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    isLoading,
    setIsCreateModalOpen,
  } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelectWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setIsOpen(false);
    navigate(`/workspaces/${workspaceId}/projects`);
  };

  const handleOpenCreateModal = () => {
    setIsOpen(false);
    setIsCreateModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-surface text-text-muted text-xs">
        <Spinner size="sm" />
        <span>Loading workspaces...</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <button
        type="button"
        onClick={handleOpenCreateModal}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-border bg-surface hover:bg-surface-hover text-text-primary text-xs font-medium transition-colors"
      >
        <span className="text-accent font-bold">+</span>
        <span>Create Workspace</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id="workspace-switcher-button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current workspace: ${activeWorkspace?.name || 'Select Workspace'}`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover text-text-primary text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus max-w-[220px]"
      >
        <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
        <span className="truncate text-left font-semibold">
          {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
        </span>
        {activeWorkspace?.currentUserRole && (
          <Badge variant={getRoleBadgeVariant(activeWorkspace.currentUserRole)} size="sm">
            {activeWorkspace.currentUserRole}
          </Badge>
        )}
        <svg
          className={`w-3.5 h-3.5 text-text-muted transition-transform ml-auto flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className="absolute left-0 mt-1.5 w-64 rounded-md border border-border bg-surface shadow-lg z-50 py-1.5 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            Workspaces ({workspaces.length})
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {workspaces.map((ws) => {
              const isSelected = activeWorkspace?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectWorkspace(ws.id)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-surface-hover transition-colors ${
                    isSelected ? 'bg-surface-hover/80 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-accent' : 'bg-transparent'
                      }`}
                    />
                    <span className="truncate text-text-primary">{ws.name}</span>
                  </div>
                  {ws.currentUserRole && (
                    <Badge variant={getRoleBadgeVariant(ws.currentUserRole)} size="sm">
                      {ws.currentUserRole}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border mt-1 pt-1 px-1">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="w-full text-left px-2.5 py-1.5 text-xs text-accent hover:bg-surface-hover rounded flex items-center gap-2 font-medium transition-colors"
            >
              <span className="font-bold">+</span>
              <span>Create New Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
