import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { TaskResponse, TaskStatus } from '@sprintflow/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { api, ApiError } from '../../lib/api-client';

const COLUMNS: Array<{ id: TaskStatus; title: string }> = [
  { id: 'BACKLOG', title: 'Backlog' },
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'DONE', title: 'Done' },
];

interface KanbanBoardProps {
  projectId: string;
  tasks: TaskResponse[];
  isViewer?: boolean;
  onTaskClick: (taskId: string) => void;
  onAddTaskClick?: (status: TaskStatus) => void;
}

interface ConflictData {
  taskId: string;
  taskTitle: string;
  targetStatus: TaskStatus;
  prevTaskId: string | null;
  nextTaskId: string | null;
}

export function KanbanBoard({
  projectId,
  tasks,
  isViewer = false,
  onTaskClick,
  onAddTaskClick,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskResponse | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag activates
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Group tasks by column status and sort by position ascending
  const columnTasks = useMemo(() => {
    const map: Record<TaskStatus, TaskResponse[]> = {
      BACKLOG: [],
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };

    tasks.forEach((task) => {
      if (map[task.status]) {
        map[task.status].push(task);
      } else {
        map.BACKLOG.push(task);
      }
    });

    Object.keys(map).forEach((key) => {
      map[key as TaskStatus].sort((a, b) => a.position - b.position);
    });

    return map;
  }, [tasks]);

  // Move Task Mutation with optimistic updates & rollback
  const moveMutation = useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: {
        version: number;
        status?: TaskStatus;
        prevTaskId?: string | null;
        nextTaskId?: string | null;
      };
    }) => api.patch<{ task: TaskResponse }>(`/api/tasks/${taskId}/move`, input),

    onMutate: async ({ taskId, input }) => {
      // Cancel queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['board-tasks', projectId] });
      await queryClient.cancelQueries({ queryKey: ['tasks', projectId] });

      const previousTasks = queryClient.getQueryData<TaskResponse[]>(['board-tasks', projectId]) || tasks;

      // Optimistically update the task in cache
      const updatedTasks = previousTasks.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            status: input.status || t.status,
            // Optimistic increment
            version: t.version + 1,
          };
        }
        return t;
      });

      queryClient.setQueryData(['board-tasks', projectId], updatedTasks);

      return { previousTasks };
    },

    onError: (err, variables, context) => {
      // Roll back to previous snapshot
      if (context?.previousTasks) {
        queryClient.setQueryData(['board-tasks', projectId], context.previousTasks);
      }

      if (err instanceof ApiError && err.status === 409) {
        // 409 Conflict: task modified elsewhere
        const targetTask = tasks.find((t) => t.id === variables.taskId);
        setConflictData({
          taskId: variables.taskId,
          taskTitle: targetTask?.title || 'This task',
          targetStatus: variables.input.status || 'BACKLOG',
          prevTaskId: variables.input.prevTaskId || null,
          nextTaskId: variables.input.nextTaskId || null,
        });
        toast.warning(
          'Task has been modified by another request. Reloading latest state.',
          'Conflict Detected',
        );
        // Refetch to sync state
        queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      } else {
        const errorMsg =
          err instanceof ApiError ? err.message : 'Network failure moving task';
        toast.error(errorMsg, 'Move Failed');
      }
    },

    onSuccess: (data) => {
      // Update with server verified task
      queryClient.setQueryData<TaskResponse[]>(['board-tasks', projectId], (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === data.task.id ? data.task : t));
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    if (isViewer) return;
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (isViewer) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    if (isViewer) return;

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const draggedTask = tasks.find((t) => t.id === activeId);
    if (!draggedTask) return;

    // Determine target column
    let targetColumnId: TaskStatus | null = null;

    // If dropped directly on a column droppable
    if (COLUMNS.some((col) => col.id === overId)) {
      targetColumnId = overId as TaskStatus;
    } else {
      // Dropped on a card in a column
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetColumnId = overTask.status;
      }
    }

    if (!targetColumnId) return;

    // Destination column tasks excluding the dragged task
    const destinationTasks = (columnTasks[targetColumnId] || []).filter(
      (t) => t.id !== activeId,
    );

    let destinationIndex = destinationTasks.length;
    if (overId !== targetColumnId) {
      const overIndex = destinationTasks.findIndex((t) => t.id === overId);
      if (overIndex !== -1) {
        destinationIndex = overIndex;
      }
    }

    // Determine neighbours
    let prevTaskId: string | null = null;
    let nextTaskId: string | null = null;

    if (destinationIndex === 0) {
      prevTaskId = null;
      nextTaskId = destinationTasks[0]?.id || null;
    } else if (destinationIndex >= destinationTasks.length) {
      prevTaskId = destinationTasks[destinationTasks.length - 1]?.id || null;
      nextTaskId = null;
    } else {
      prevTaskId = destinationTasks[destinationIndex - 1]?.id || null;
      nextTaskId = destinationTasks[destinationIndex]?.id || null;
    }

    // Check if position or column actually changed
    const currentColumnTasks = columnTasks[draggedTask.status];
    const currentIndex = currentColumnTasks.findIndex((t) => t.id === activeId);
    const isSameColumn = draggedTask.status === targetColumnId;

    if (isSameColumn && currentIndex === destinationIndex) {
      return; // No-op
    }

    // Trigger optimistic move mutation
    moveMutation.mutate({
      taskId: draggedTask.id,
      input: {
        version: draggedTask.version,
        status: targetColumnId,
        prevTaskId,
        nextTaskId,
      },
    });
  };

  const handleRetryConflict = async () => {
    if (!conflictData) return;

    // Fetch latest task version
    try {
      const fresh = await api.get<{ task: TaskResponse }>(`/api/tasks/${conflictData.taskId}`);
      const freshTask = fresh.task;

      setConflictData(null);

      // Re-trigger move with updated version
      moveMutation.mutate({
        taskId: freshTask.id,
        input: {
          version: freshTask.version,
          status: conflictData.targetStatus,
          prevTaskId: conflictData.prevTaskId,
          nextTaskId: conflictData.nextTaskId,
        },
      });
    } catch {
      toast.error('Unable to fetch latest task version for retry', 'Retry Failed');
      setConflictData(null);
    }
  };

  return (
    <>
      <DndContext
        sensors={!isViewer ? sensors : []}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          data-testid="kanban-board-container"
          className="flex items-start gap-4 overflow-x-auto pb-6 pt-1 select-none"
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={columnTasks[col.id]}
              isViewer={isViewer}
              onTaskClick={onTaskClick}
              onAddTaskClick={onAddTaskClick}
            />
          ))}
        </div>

        {/* Drag Overlay respecting current theme */}
        <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeTask ? (
            <div className="w-72 sm:w-80">
              <KanbanCard task={activeTask} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 409 Conflict Retry Modal */}
      <Modal
        isOpen={Boolean(conflictData)}
        onClose={() => setConflictData(null)}
        title="Task Update Conflict (409)"
        description={`The task "${conflictData?.taskTitle}" was modified by another user while you were moving it.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setConflictData(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRetryConflict}>
              Retry Move
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          The latest version of the task has been loaded. Would you like to retry moving it to{' '}
          <strong className="text-text-primary capitalize">
            {conflictData?.targetStatus.toLowerCase().replace('_', ' ')}
          </strong>
          ?
        </p>
      </Modal>
    </>
  );
}
