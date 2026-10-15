import { Role } from '@sprintflow/shared';
import { ForbiddenError, BadRequestError } from '../errors/app-error';

export type WorkspaceAction =
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'members:read'
  | 'members:add'
  | 'members:update'
  | 'members:remove'
  | 'projects:read'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'tasks:read'
  | 'tasks:create'
  | 'tasks:update'
  | 'tasks:delete'
  | 'comments:create';

export const PERMISSION_MATRIX: Record<Role, ReadonlySet<WorkspaceAction>> = {
  OWNER: new Set<WorkspaceAction>([
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'members:read',
    'members:add',
    'members:update',
    'members:remove',
    'projects:read',
    'projects:create',
    'projects:update',
    'projects:delete',
    'tasks:read',
    'tasks:create',
    'tasks:update',
    'tasks:delete',
    'comments:create',
  ]),
  ADMIN: new Set<WorkspaceAction>([
    'workspace:read',
    'workspace:update',
    'members:read',
    'members:add',
    'members:update',
    'members:remove',
    'projects:read',
    'projects:create',
    'projects:update',
    'tasks:read',
    'tasks:create',
    'tasks:update',
    'tasks:delete',
    'comments:create',
  ]),
  MEMBER: new Set<WorkspaceAction>([
    'workspace:read',
    'members:read',
    'projects:read',
    'tasks:read',
    'tasks:create',
    'tasks:update',
    'tasks:delete',
    'comments:create',
  ]),
  VIEWER: new Set<WorkspaceAction>([
    'workspace:read',
    'members:read',
    'projects:read',
    'tasks:read',
  ]),
};

/**
 * Checks whether a given role is permitted to execute a specific action.
 */
export function hasPermission(role: Role, action: WorkspaceAction): boolean {
  const allowed = PERMISSION_MATRIX[role];
  return allowed ? allowed.has(action) : false;
}

/**
 * Throws ForbiddenError if the role does not have the specified action permission.
 */
export function assertPermission(role: Role, action: WorkspaceAction): void {
  if (!hasPermission(role, action)) {
    throw new ForbiddenError(`Role ${role} is not authorized to perform action '${action}'`);
  }
}

export interface CanModifyMemberParams {
  actorRole: Role;
  targetRole: Role;
  newRole?: Role;
  isTargetLastOwner: boolean;
  action: 'update_role' | 'remove';
}

/**
 * Enforces member management safety invariants:
 * 1. Admin cannot modify or remove an Owner.
 * 2. Only Owners can assign the Owner role.
 * 3. Cannot remove or demote the last Owner.
 */
export function assertMemberModificationSafety(params: CanModifyMemberParams): void {
  const { actorRole, targetRole, newRole, isTargetLastOwner, action } = params;

  // 1. Admin cannot modify or remove an Owner
  if (actorRole === 'ADMIN' && targetRole === 'OWNER') {
    throw new ForbiddenError(
      action === 'remove'
        ? 'Admins cannot remove workspace owners'
        : 'Admins cannot modify workspace owners',
    );
  }

  // 2. Only Owners can promote someone to Owner
  if (actorRole === 'ADMIN' && newRole === 'OWNER') {
    throw new ForbiddenError('Only workspace owners can assign the owner role');
  }

  // 3. Last Owner protection: Cannot remove or demote the last Owner
  if (targetRole === 'OWNER' && isTargetLastOwner) {
    if (action === 'remove' || (action === 'update_role' && newRole !== 'OWNER')) {
      throw new BadRequestError('Cannot remove or demote the last owner of the workspace');
    }
  }
}
