import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskResponse, TaskPriority } from '@sprintflow/shared';
import { Avatar } from '../ui/Avatar';

interface KanbanCardProps {
  task: TaskResponse;
  isViewer?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
}

function getPriorityDotColor(priority: TaskPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-danger';
    case 'HIGH':
      return 'bg-warning';
    case 'MEDIUM':
      return 'bg-text-muted';
    case 'LOW':
    default:
      return 'bg-border';
  }
}

export function KanbanCard({
  task,
  isViewer = false,
  isOverlay = false,
  onClick,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
    disabled: isViewer,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDragging && onClick) {
      onClick();
    }
  };

  const priorityDot = getPriorityDotColor(task.priority);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={!isDragging ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}, Priority: ${task.priority}, Version: ${task.version}`}
      className={`group relative rounded-lg border border-border bg-surface p-3.5 text-left transition-all select-none ${
        isOverlay
          ? 'shadow-xl rotate-1 border-accent/60 opacity-95 cursor-grabbing z-50'
          : isDragging
          ? 'opacity-30 border-dashed border-border'
          : isViewer
          ? 'cursor-pointer hover:border-text-muted hover:shadow-sm'
          : 'cursor-grab active:cursor-grabbing hover:border-text-muted hover:shadow-sm'
      }`}
    >
      {/* Top row: Priority dot + Version */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className={`w-2 h-2 rounded-full ${priorityDot} shrink-0`} aria-hidden="true" />
          <span className="capitalize">{task.priority.toLowerCase()}</span>
        </div>

        <span className="text-[10px] font-mono text-text-muted bg-surface-hover/80 px-1 py-0.5 rounded border border-border">
          v{task.version}
        </span>
      </div>

      {/* Task Title */}
      <h3 className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors line-clamp-2 leading-snug mb-2.5">
        {task.title}
      </h3>

      {/* Bottom row: Assignee avatar & Due Date */}
      <div className="flex items-center justify-between gap-2 text-xs text-text-muted pt-2 border-t border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assignee ? (
            <>
              <Avatar name={task.assignee.name || task.assignee.email} size="xs" />
              <span className="truncate max-w-[100px] text-[11px] text-text-primary">
                {task.assignee.name || task.assignee.email}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-text-muted italic">Unassigned</span>
          )}
        </div>

        {task.dueDate && (
          <span className="text-[11px] whitespace-nowrap text-text-muted">
            {new Date(task.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>
    </div>
  );
}
