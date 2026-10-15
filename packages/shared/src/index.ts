import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const APP_NAME = 'SprintFlow';

// Role Schema
export const RoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type Role = z.infer<typeof RoleSchema>;

// Auth Schemas
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const authResponseSchema = z.object({
  user: userResponseSchema,
  message: z.string().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Workspace Schemas
export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Workspace name must be at least 2 characters').max(50, 'Workspace name cannot exceed 50 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug cannot exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Workspace name must be at least 2 characters').max(50, 'Workspace name cannot exceed 50 characters').optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug cannot exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .optional(),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

// Workspace Member Schemas
export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  role: RoleSchema.default('MEMBER'),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: RoleSchema,
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const workspaceMemberResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: RoleSchema,
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  user: userResponseSchema.optional(),
});

export type WorkspaceMemberResponse = z.infer<typeof workspaceMemberResponseSchema>;

export const workspaceResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  currentUserRole: RoleSchema.optional(),
  membersCount: z.number().int().optional(),
  projectsCount: z.number().int().optional(),
});

export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;

// Project Schemas
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'Project key must be at least 2 characters')
  .max(5, 'Project key cannot exceed 5 characters')
  .regex(/^[A-Z0-9]{2,5}$/, 'Project key must consist of 2 to 5 uppercase alphanumeric characters');

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(50, 'Project name cannot exceed 50 characters'),
  key: projectKeySchema,
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(50, 'Project name cannot exceed 50 characters').optional(),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional().nullable(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export type ProjectPaginationQuery = z.infer<typeof projectPaginationQuerySchema>;

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string(),
  key: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  tasksCount: z.number().int().optional(),
  sprintsCount: z.number().int().optional(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectListResponseSchema = z.object({
  projects: z.array(projectResponseSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

// Task Schemas
export const TaskStatusSchema = z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSortBySchema = z.enum(['position', 'createdAt', 'dueDate', 'priority', 'title']);
export type TaskSortBy = z.infer<typeof TaskSortBySchema>;

export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').optional().nullable(),
  status: TaskStatusSchema.default('BACKLOG'),
  priority: TaskPrioritySchema.default('MEDIUM'),
  assigneeId: z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  version: z.number().int().positive('Version must be a positive integer'),
  title: z.string().trim().min(1, 'Title cannot be empty').max(255, 'Title cannot exceed 255 characters').optional(),
  description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').optional().nullable(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigneeId: z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const moveTaskSchema = z.object({
  version: z.number().int().positive('Version must be a positive integer'),
  status: TaskStatusSchema.optional(),
  prevTaskId: z.string().uuid('Invalid previous task ID').optional().nullable(),
  nextTaskId: z.string().uuid('Invalid next task ID').optional().nullable(),
});

export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const taskPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigneeId: z.string().uuid('Invalid assignee ID').optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  sortBy: TaskSortBySchema.default('position'),
  sortOrder: SortOrderSchema.default('asc'),
});

export type TaskPaginationQuery = z.infer<typeof taskPaginationQuerySchema>;

export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.union([z.string(), z.date()]).nullable().optional(),
  position: z.number(),
  version: z.number().int(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  assignee: userResponseSchema.nullable().optional(),
});

export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const taskListResponseSchema = z.object({
  tasks: z.array(taskResponseSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

// Comment Schemas
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment cannot be empty').max(10000, 'Comment cannot exceed 10000 characters'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment cannot be empty').max(10000, 'Comment cannot exceed 10000 characters'),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const commentPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CommentPaginationQuery = z.infer<typeof commentPaginationQuerySchema>;

export const commentResponseSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  author: userResponseSchema.optional(),
});

export type CommentResponse = z.infer<typeof commentResponseSchema>;

export const commentListResponseSchema = z.object({
  comments: z.array(commentResponseSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type CommentListResponse = z.infer<typeof commentListResponseSchema>;

// Activity Schemas
export const activityPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityPaginationQuery = z.infer<typeof activityPaginationQuerySchema>;

export const activityResponseSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  actorId: z.string().uuid(),
  action: z.string(),
  metadata: z.record(z.any()),
  createdAt: z.union([z.string(), z.date()]),
  actor: userResponseSchema.optional(),
});

export type ActivityResponse = z.infer<typeof activityResponseSchema>;

export const activityListResponseSchema = z.object({
  activities: z.array(activityResponseSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;



