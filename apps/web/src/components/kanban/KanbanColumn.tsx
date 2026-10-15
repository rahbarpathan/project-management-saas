import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskResponse, TaskStatus } from '@sprintflow/shared';
import { KanbanCard } from './KanbanCard';
import { Badge } from '../ui/Badge';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: TaskResponse[];
  isViewer?: boolean;
  onTaskClick: (taskId: string) => void;
  onAddTaskClick?: (status: TaskStatus) => void;
}

function getColumnIndicator(status: TaskStatus): string {
  switch (status) {
    case 'BACKLOG':
      return 'bg-text-muted';
    case 'TODO':
      return 'bg-warning';
    case 'IN_PROGRESS':
      return 'bg-accent';
    case 'DONE':
      return 'bg-success';
    default:
      return 'bg-border';
  }
}

export function KanbanColumn({
  id,
  title,
  tasks,
  isViewer = false,
  onTaskClick,
  onAddTaskClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'Column',
      columnId: id,
    },
  });

  const indicator = getColumnIndicator(id);

  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-column-${id.toLowerCase()}`}
      className={`w-72 sm:w-80 shrink-0 flex flex-col rounded-xl border bg-surface/60 transition-colors ${
        isOver
          ? 'border-accent/60 bg-accent/[0.03]'
          : 'border-border'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${indicator}`} aria-hidden="true" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">
            {title}
          </h2>
          <Badge variant="default" size="sm">
            {tasks.length}
          </Badge>
        </div>

        {!isViewer && onAddTaskClick && (
          <button
            type="button"
            onClick={() => onAddTaskClick(id)}
            aria-label={`Add task to ${title}`}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover text-xs transition-colors"
          >
            <span className="font-bold text-sm">+</span>
          </button>
        )}
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 p-2.5 flex flex-col gap-2.5 overflow-y-auto max-h-[calc(100vh-250px)] min-h-[150px]">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              isViewer={isViewer}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-lg text-center">
            <p className="text-xs text-text-muted font-medium">No tasks</p>
            {!isViewer && (
              <p className="text-[11px] text-text-muted/80 mt-0.5">Drop a card here</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
