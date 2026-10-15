import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  assertPermission,
  assertMemberModificationSafety,
  WorkspaceAction,
} from './permissions';
import { ForbiddenError, BadRequestError } from '../errors/app-error';

describe('Central Permission Matrix', () => {
  describe('VIEWER Role', () => {
    it('allows read-only actions', () => {
      expect(hasPermission('VIEWER', 'workspace:read')).toBe(true);
      expect(hasPermission('VIEWER', 'members:read')).toBe(true);
      expect(hasPermission('VIEWER', 'projects:read')).toBe(true);
      expect(hasPermission('VIEWER', 'tasks:read')).toBe(true);
    });

    it('rejects mutation actions', () => {
      const deniedActions: WorkspaceAction[] = [
        'workspace:update',
        'workspace:delete',
        'members:add',
        'members:update',
        'members:remove',
        'projects:create',
        'projects:update',
        'projects:delete',
        'tasks:create',
        'tasks:update',
        'tasks:delete',
        'comments:create',
      ];

      for (const action of deniedActions) {
        expect(hasPermission('VIEWER', action)).toBe(false);
        expect(() => assertPermission('VIEWER', action)).toThrowError(ForbiddenError);
      }
    });
  });

  describe('MEMBER Role', () => {
    it('allows reading resources, managing tasks, and creating comments', () => {
      expect(hasPermission('MEMBER', 'workspace:read')).toBe(true);
      expect(hasPermission('MEMBER', 'tasks:create')).toBe(true);
      expect(hasPermission('MEMBER', 'tasks:update')).toBe(true);
      expect(hasPermission('MEMBER', 'tasks:delete')).toBe(true);
      expect(hasPermission('MEMBER', 'comments:create')).toBe(true);
    });

    it('denies workspace configuration and member management', () => {
      expect(hasPermission('MEMBER', 'workspace:update')).toBe(false);
      expect(hasPermission('MEMBER', 'workspace:delete')).toBe(false);
      expect(hasPermission('MEMBER', 'members:add')).toBe(false);
      expect(hasPermission('MEMBER', 'members:update')).toBe(false);
      expect(hasPermission('MEMBER', 'members:remove')).toBe(false);
      expect(hasPermission('MEMBER', 'projects:create')).toBe(false);
    });
  });

  describe('ADMIN Role', () => {
    it('allows workspace update, member management, project management, and task operations', () => {
      expect(hasPermission('ADMIN', 'workspace:update')).toBe(true);
      expect(hasPermission('ADMIN', 'members:add')).toBe(true);
      expect(hasPermission('ADMIN', 'members:update')).toBe(true);
      expect(hasPermission('ADMIN', 'members:remove')).toBe(true);
      expect(hasPermission('ADMIN', 'projects:create')).toBe(true);
      expect(hasPermission('ADMIN', 'projects:update')).toBe(true);
      expect(hasPermission('ADMIN', 'tasks:create')).toBe(true);
    });

    it('denies workspace deletion and project deletion', () => {
      expect(hasPermission('ADMIN', 'workspace:delete')).toBe(false);
      expect(hasPermission('ADMIN', 'projects:delete')).toBe(false);
      expect(() => assertPermission('ADMIN', 'workspace:delete')).toThrowError(ForbiddenError);
    });
  });

  describe('OWNER Role', () => {
    it('permits all workspace actions including deletion', () => {
      const allActions: WorkspaceAction[] = [
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
      ];

      for (const action of allActions) {
        expect(hasPermission('OWNER', action)).toBe(true);
        expect(() => assertPermission('OWNER', action)).not.toThrow();
      }
    });
  });

  describe('Member Management Guardrails & Safety Invariants', () => {
    it('prevents an ADMIN from modifying an OWNER', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'ADMIN',
          targetRole: 'OWNER',
          newRole: 'MEMBER',
          isTargetLastOwner: false,
          action: 'update_role',
        }),
      ).toThrowError(ForbiddenError);
    });

    it('prevents an ADMIN from removing an OWNER', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'ADMIN',
          targetRole: 'OWNER',
          isTargetLastOwner: false,
          action: 'remove',
        }),
      ).toThrowError(ForbiddenError);
    });

    it('prevents an ADMIN from promoting someone to OWNER', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'ADMIN',
          targetRole: 'MEMBER',
          newRole: 'OWNER',
          isTargetLastOwner: false,
          action: 'update_role',
        }),
      ).toThrowError(ForbiddenError);
    });

    it('prevents demoting the last OWNER of a workspace', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'OWNER',
          targetRole: 'OWNER',
          newRole: 'ADMIN',
          isTargetLastOwner: true,
          action: 'update_role',
        }),
      ).toThrowError(BadRequestError);
    });

    it('prevents removing the last OWNER of a workspace', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'OWNER',
          targetRole: 'OWNER',
          isTargetLastOwner: true,
          action: 'remove',
        }),
      ).toThrowError(BadRequestError);
    });

    it('allows an OWNER to demote an OWNER when multiple owners exist', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'OWNER',
          targetRole: 'OWNER',
          newRole: 'ADMIN',
          isTargetLastOwner: false,
          action: 'update_role',
        }),
      ).not.toThrow();
    });

    it('allows an OWNER to remove an OWNER when multiple owners exist', () => {
      expect(() =>
        assertMemberModificationSafety({
          actorRole: 'OWNER',
          targetRole: 'OWNER',
          isTargetLastOwner: false,
          action: 'remove',
        }),
      ).not.toThrow();
    });
  });
});
