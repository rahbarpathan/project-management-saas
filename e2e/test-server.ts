import http from 'node:http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'node:crypto';

const PORT = 4000;
const CLIENT_URL = 'http://localhost:3000';
const JWT_SECRET = 'e2e-jwt-access-secret-32-chars-long!';

const app = express();
app.use(
  cors({
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:3000'],
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// State definitions
interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Member {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId: string | null;
  dueDate: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Sprint {
  id: string;
  projectId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
}

interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

interface Activity {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// In-Memory Database initialized with seed accounts
const passwordHash = bcrypt.hashSync('Password123!', 8);

const users: User[] = [
  { id: 'usr-owner-1', email: 'owner@sprintflow.dev', name: 'Alex Vance', passwordHash },
  { id: 'usr-admin-2', email: 'admin@sprintflow.dev', name: 'Sam Taylor', passwordHash },
  { id: 'usr-member-3', email: 'member@sprintflow.dev', name: 'Morgan Lee', passwordHash },
  { id: 'usr-viewer-4', email: 'viewer@sprintflow.dev', name: 'Val Rivera', passwordHash },
];

const workspaces: Workspace[] = [
  { id: 'ws-acme-1', name: 'Acme Corp', slug: 'acme-corp' },
];

const members: Member[] = [
  { id: 'mem-1', workspaceId: 'ws-acme-1', userId: 'usr-owner-1', role: 'OWNER' },
  { id: 'mem-2', workspaceId: 'ws-acme-1', userId: 'usr-admin-2', role: 'ADMIN' },
  { id: 'mem-3', workspaceId: 'ws-acme-1', userId: 'usr-member-3', role: 'MEMBER' },
  { id: 'mem-4', workspaceId: 'ws-acme-1', userId: 'usr-viewer-4', role: 'VIEWER' },
];

const projects: Project[] = [
  {
    id: 'prj-plat-1',
    workspaceId: 'ws-acme-1',
    name: 'Core Platform',
    key: 'PLAT',
    description: 'High-availability infrastructure and collaborative tools.',
  },
];

const sprints: Sprint[] = [
  {
    id: 'spr-1',
    projectId: 'prj-plat-1',
    name: 'Sprint 1 - Foundation',
    startDate: new Date(Date.now() - 7 * 86400000).toISOString(),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    status: 'ACTIVE',
  },
];

const tasks: Task[] = [
  {
    id: 'tsk-1',
    projectId: 'prj-plat-1',
    title: 'Setup production healthchecks and liveness probes',
    description: 'Implement /health and /ready checks across instances.',
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: 'usr-member-3',
    dueDate: '2026-11-01',
    position: 1000,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tsk-2',
    projectId: 'prj-plat-1',
    title: 'Review permission matrix and RBAC guardrails',
    description: 'Verify owner protection and non-member 404 security.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    assigneeId: 'usr-admin-2',
    dueDate: null,
    position: 2000,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tsk-3',
    projectId: 'prj-plat-1',
    title: 'Validate multi-stage Docker build files',
    description: 'Ensure non-root user execution and minimal layers.',
    status: 'DONE',
    priority: 'URGENT',
    assigneeId: 'usr-owner-1',
    dueDate: null,
    position: 3000,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tsk-4',
    projectId: 'prj-plat-1',
    title: 'Create dark theme contrast tests',
    description: 'Verify WCAG compliance across dark and light palettes.',
    status: 'BACKLOG',
    priority: 'LOW',
    assigneeId: null,
    dueDate: null,
    position: 4000,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const comments: Comment[] = [
  {
    id: 'com-1',
    taskId: 'tsk-1',
    authorId: 'usr-owner-1',
    content: 'Initial probe testing passed locally.',
    createdAt: new Date().toISOString(),
  },
];

const activities: Activity[] = [];

// HTTP & Socket Server
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:3000'],
    credentials: true,
  },
});

// Presence store: projectId -> Map<socketId, { id, name, email, avatarUrl, joinedAt }>
const projectPresence = new Map<string, Map<string, unknown>>();

// Helper to get authenticated user
function getAuthUser(req: Request): User | null {
  const token = req.cookies?.access_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return users.find((u) => u.id === payload.userId) || null;
  } catch {
    return null;
  }
}

function setAuthCookies(res: Response, user: User) {
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('access_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600000,
  });
  res.cookie('refresh_token', 'mock-refresh-token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400000,
  });
}

// ----------------- ROUTES ----------------- //

// Shallow health
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
});

// AUTH
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing fields' } });
    return;
  }
  const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'User already exists' } });
    return;
  }
  const newUser: User = {
    id: `usr-${randomUUID()}`,
    name,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 8),
  };
  users.push(newUser);
  setAuthCookies(res, newUser);
  res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email, avatarUrl: null } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } });
    return;
  }
  setAuthCookies(res, user);
  res.status(200).json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: null } });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  res.status(200).json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: null } });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.status(200).json({ message: 'Logged out successfully' });
});

// WORKSPACES
app.get('/api/workspaces', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const userMembers = members.filter((m) => m.userId === user.id);
  const userWorkspaces = userMembers.map((m) => {
    const ws = workspaces.find((w) => w.id === m.workspaceId)!;
    return { ...ws, currentUserRole: m.role };
  });
  res.status(200).json({ workspaces: userWorkspaces });
});

app.post('/api/workspaces', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const { name, slug } = req.body;
  if (!name) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name required' } });
    return;
  }
  const wsSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const newWs: Workspace = { id: `ws-${randomUUID()}`, name, slug: wsSlug };
  workspaces.push(newWs);
  members.push({ id: `mem-${randomUUID()}`, workspaceId: newWs.id, userId: user.id, role: 'OWNER' });
  res.status(201).json({ workspace: { ...newWs, currentUserRole: 'OWNER' } });
});

app.get('/api/workspaces/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const member = members.find((m) => m.workspaceId === req.params.id && m.userId === user.id);
  const ws = workspaces.find((w) => w.id === req.params.id);
  if (!ws || !member) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
    return;
  }
  res.status(200).json({ workspace: { ...ws, currentUserRole: member.role } });
});

app.get('/api/workspaces/:id/members', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const wsMembers = members.filter((m) => m.workspaceId === req.params.id);
  const payload = wsMembers.map((m) => {
    const u = users.find((usr) => usr.id === m.userId)!;
    return {
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      user: { id: u.id, name: u.name, email: u.email, avatarUrl: null },
    };
  });
  res.status(200).json({ members: payload });
});

// PROJECTS
app.get('/api/workspaces/:id/projects', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const wsProjects = projects.filter((p) => p.workspaceId === req.params.id);
  const payload = wsProjects.map((p) => ({
    ...p,
    tasksCount: tasks.filter((t) => t.projectId === p.id).length,
    createdAt: new Date().toISOString(),
  }));
  res.status(200).json({
    projects: payload,
    pagination: { page: 1, limit: 50, total: payload.length, totalPages: 1 },
  });
});

app.post('/api/workspaces/:id/projects', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const member = members.find((m) => m.workspaceId === req.params.id && m.userId === user.id);
  if (!member || member.role === 'VIEWER') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    return;
  }
  const { name, key, description } = req.body;
  const newPrj: Project = {
    id: `prj-${randomUUID()}`,
    workspaceId: req.params.id,
    name,
    key: key.toUpperCase(),
    description: description || null,
  };
  projects.push(newPrj);
  res.status(201).json({ project: { ...newPrj, tasksCount: 0, createdAt: new Date().toISOString() } });
});

app.get('/api/projects/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const prj = projects.find((p) => p.id === req.params.id);
  if (!prj) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.status(200).json({ project: { ...prj, tasksCount: tasks.filter((t) => t.projectId === prj.id).length } });
});

// TASKS
app.get('/api/projects/:id/tasks', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const prjTasks = tasks.filter((t) => t.projectId === req.params.id).sort((a, b) => a.position - b.position);
  const payload = prjTasks.map((t) => {
    const assignee = t.assigneeId ? users.find((u) => u.id === t.assigneeId) : null;
    return {
      ...t,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, avatarUrl: null } : null,
      commentsCount: comments.filter((c) => c.taskId === t.id).length,
    };
  });
  res.status(200).json({
    tasks: payload,
    pagination: { page: 1, limit: 100, total: payload.length, totalPages: 1 },
  });
});

app.post('/api/projects/:id/tasks', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const prj = projects.find((p) => p.id === req.params.id);
  if (!prj) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  const member = members.find((m) => m.workspaceId === prj.workspaceId && m.userId === user.id);
  if (!member || member.role === 'VIEWER') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers cannot create tasks' } });
    return;
  }

  const { title, description, status, priority, assigneeId, dueDate } = req.body;
  const colTasks = tasks.filter((t) => t.projectId === prj.id && t.status === (status || 'TODO'));
  const nextPos = colTasks.length > 0 ? Math.max(...colTasks.map((t) => t.position)) + 1000 : 1000;

  const newTask: Task = {
    id: `tsk-${randomUUID()}`,
    projectId: prj.id,
    title,
    description: description || null,
    status: status || 'TODO',
    priority: priority || 'MEDIUM',
    assigneeId: assigneeId || null,
    dueDate: dueDate || null,
    position: nextPos,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.push(newTask);

  const assignee = newTask.assigneeId ? users.find((u) => u.id === newTask.assigneeId) : null;
  const taskResponse = {
    ...newTask,
    assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, avatarUrl: null } : null,
    commentsCount: 0,
  };

  // Broadcast task:created
  io.to(`project:${prj.id}`).emit('task:created', {
    eventId: randomUUID(),
    projectId: prj.id,
    entityId: newTask.id,
    version: 1,
    task: taskResponse,
  });

  res.status(201).json({ task: taskResponse });
});

app.get('/api/tasks/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    return;
  }
  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) : null;
  res.status(200).json({
    task: {
      ...task,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, avatarUrl: null } : null,
      commentsCount: comments.filter((c) => c.taskId === task.id).length,
    },
  });
});

app.patch('/api/tasks/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    return;
  }
  const prj = projects.find((p) => p.id === task.projectId);
  const member = prj ? members.find((m) => m.workspaceId === prj.workspaceId && m.userId === user.id) : null;
  if (!member || member.role === 'VIEWER') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers cannot edit tasks' } });
    return;
  }

  const { version, title, description, status, priority, assigneeId, dueDate } = req.body;
  // Optimistic concurrency check
  if (version !== undefined && version !== task.version) {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Task version mismatch. The task was modified by another user.',
        details: { currentTask: task },
      },
    });
    return;
  }

  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (status !== undefined) task.status = status;
  if (priority !== undefined) task.priority = priority;
  if (assigneeId !== undefined) task.assigneeId = assigneeId;
  if (dueDate !== undefined) task.dueDate = dueDate;
  task.version += 1;
  task.updatedAt = new Date().toISOString();

  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) : null;
  const taskResponse = {
    ...task,
    assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, avatarUrl: null } : null,
    commentsCount: comments.filter((c) => c.taskId === task.id).length,
  };

  if (req.query.silent !== 'true') {
    io.to(`project:${task.projectId}`).emit('task:updated', {
      eventId: randomUUID(),
      projectId: task.projectId,
      entityId: task.id,
      version: task.version,
      task: taskResponse,
    });
  }

  res.status(200).json({ task: taskResponse });
});

app.patch('/api/tasks/:id/move', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    return;
  }
  const prj = projects.find((p) => p.id === task.projectId);
  const member = prj ? members.find((m) => m.workspaceId === prj.workspaceId && m.userId === user.id) : null;
  if (!member || member.role === 'VIEWER') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers cannot move tasks' } });
    return;
  }

  const { version, status, prevTaskId, nextTaskId } = req.body;
  if (version !== undefined && version !== task.version) {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Task version mismatch',
        details: { currentTask: task },
      },
    });
    return;
  }

  let newPosition = task.position;
  const prev = prevTaskId ? tasks.find((t) => t.id === prevTaskId) : null;
  const next = nextTaskId ? tasks.find((t) => t.id === nextTaskId) : null;

  if (prev && next) {
    newPosition = (prev.position + next.position) / 2;
  } else if (prev) {
    newPosition = prev.position + 1000;
  } else if (next) {
    newPosition = next.position / 2;
  }

  task.position = newPosition;
  if (status) task.status = status;
  task.version += 1;
  task.updatedAt = new Date().toISOString();

  const assignee = task.assigneeId ? users.find((u) => u.id === task.assigneeId) : null;
  const taskResponse = {
    ...task,
    assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, avatarUrl: null } : null,
    commentsCount: comments.filter((c) => c.taskId === task.id).length,
  };

  io.to(`project:${task.projectId}`).emit('task:moved', {
    eventId: randomUUID(),
    projectId: task.projectId,
    entityId: task.id,
    version: task.version,
    task: taskResponse,
  });

  res.status(200).json({ task: taskResponse });
});

// SPRINTS
app.get('/api/projects/:id/sprints', (req, res) => {
  const prjSprints = sprints.filter((s) => s.projectId === req.params.id);
  res.status(200).json({ sprints: prjSprints });
});

app.post('/api/projects/:id/sprints', (req, res) => {
  const { name, startDate, endDate } = req.body;
  const newSprint: Sprint = {
    id: `spr-${randomUUID()}`,
    projectId: req.params.id,
    name,
    startDate: startDate || null,
    endDate: endDate || null,
    status: 'PLANNED',
  };
  sprints.push(newSprint);
  res.status(201).json({ sprint: newSprint });
});

// COMMENTS
app.get('/api/tasks/:id/comments', (req, res) => {
  const tComments = comments.filter((c) => c.taskId === req.params.id);
  const payload = tComments.map((c) => {
    const author = users.find((u) => u.id === c.authorId)!;
    return {
      ...c,
      author: { id: author.id, name: author.name, email: author.email, avatarUrl: null },
    };
  });
  res.status(200).json({ comments: payload, pagination: { page: 1, limit: 50, total: payload.length, totalPages: 1 } });
});

app.post('/api/tasks/:id/comments', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const { content } = req.body;
  const newComment: Comment = {
    id: `com-${randomUUID()}`,
    taskId: req.params.id,
    authorId: user.id,
    content,
    createdAt: new Date().toISOString(),
  };
  comments.push(newComment);
  res.status(201).json({
    comment: {
      ...newComment,
      author: { id: user.id, name: user.name, email: user.email, avatarUrl: null },
    },
  });
});

// ACTIVITY
app.get('/api/tasks/:id/activity', (req, res) => {
  const tActivities = activities.filter((a) => a.taskId === req.params.id);
  res.status(200).json({
    activities: tActivities,
    pagination: { page: 1, limit: 50, total: tActivities.length, totalPages: 1 },
  });
});

// SOCKET.IO EVENTS
io.on('connection', (socket) => {
  let currentUser: User | null = null;
  const cookies = socket.handshake.headers.cookie;
  if (cookies) {
    const match = cookies.match(/access_token=([^;]+)/);
    if (match?.[1]) {
      try {
        const payload = jwt.verify(match[1], JWT_SECRET) as { userId: string };
        currentUser = users.find((u) => u.id === payload.userId) || null;
      } catch {
        // ignore
      }
    }
  }

  socket.on('join:project', ({ projectId }, callback) => {
    socket.join(`project:${projectId}`);
    if (!projectPresence.has(projectId)) {
      projectPresence.set(projectId, new Map());
    }
    const map = projectPresence.get(projectId)!;
    if (currentUser) {
      map.set(socket.id, {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: null,
        joinedAt: new Date().toISOString(),
      });
    }

    const presenceList = Array.from(map.values());
    io.to(`project:${projectId}`).emit('presence:update', {
      projectId,
      users: presenceList,
    });

    if (callback) {
      callback({ success: true, presence: presenceList });
    }
  });

  socket.on('disconnect', () => {
    projectPresence.forEach((map, projectId) => {
      if (map.has(socket.id)) {
        map.delete(socket.id);
        io.to(`project:${projectId}`).emit('presence:update', {
          projectId,
          users: Array.from(map.values()),
        });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`[E2E Server] SprintFlow mock API & Socket.IO running on http://localhost:${PORT}`);
});
