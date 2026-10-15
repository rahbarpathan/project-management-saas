import crypto from 'node:crypto';
import {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
  WorkspaceResponse,
  WorkspaceMemberResponse,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../common/errors/app-error';
import {
  assertPermission,
  assertMemberModificationSafety,
} from '../../common/permissions';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || 'workspace';
}

export class WorkspacesService {
  /**
   * Helper to fetch an authenticated user's membership in a workspace.
   * Throws NotFoundError if the user is not a member or workspace does not exist,
   * completely preventing cross-tenant existence enumeration.
   */
  public async getMembershipOrThrow(userId: string, workspaceId: string) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Workspace not found');
    }

    return membership;
  }

  /**
   * Generates a unique slug for a workspace based on provided name or custom slug.
   */
  public async generateUniqueSlug(baseName: string, requestedSlug?: string): Promise<string> {
    const raw = requestedSlug ? slugify(requestedSlug) : slugify(baseName);
    let candidate = raw;

    const existing = await prisma.workspace.findUnique({
      where: { slug: candidate },
    });

    if (!existing) {
      return candidate;
    }

    if (requestedSlug) {
      throw new ConflictError(`Workspace slug '${requestedSlug}' is already taken`);
    }

    // Auto-generate unique suffix if generated from name
    const suffix = crypto.randomBytes(3).toString('hex');
    candidate = `${raw}-${suffix}`;
    return candidate;
  }

  /**
   * Creates a workspace and assigns the creator as OWNER in a single transaction.
   */
  public async createWorkspace(userId: string, input: CreateWorkspaceInput): Promise<WorkspaceResponse> {
    const slug = await this.generateUniqueSlug(input.name, input.slug);

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          slug,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          userId,
          role: 'OWNER',
        },
      });

      return created;
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      currentUserRole: 'OWNER',
      membersCount: 1,
      projectsCount: 0,
    };
  }

  /**
   * Lists all workspaces in which the authenticated user is a member.
   */
  public async listUserWorkspaces(userId: string): Promise<WorkspaceResponse[]> {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                members: true,
                projects: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      createdAt: m.workspace.createdAt,
      updatedAt: m.workspace.updatedAt,
      currentUserRole: m.role as Role,
      membersCount: m.workspace._count?.members ?? 0,
      projectsCount: m.workspace._count?.projects ?? 0,
    }));
  }

  /**
   * Retrieves single workspace by ID. Returns 404 if not found or user is not a member.
   */
  public async getWorkspaceById(userId: string, workspaceId: string): Promise<WorkspaceResponse> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'workspace:read');

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      currentUserRole: membership.role as Role,
      membersCount: workspace._count?.members ?? 0,
      projectsCount: workspace._count?.projects ?? 0,
    };
  }

  /**
   * Updates workspace settings (name, slug). Requires workspace:update (ADMIN or OWNER).
   */
  public async updateWorkspace(
    userId: string,
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceResponse> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'workspace:update');

    let newSlug: string | undefined;
    if (input.slug) {
      newSlug = slugify(input.slug);
      const existing = await prisma.workspace.findFirst({
        where: {
          slug: newSlug,
          NOT: { id: workspaceId },
        },
      });

      if (existing) {
        throw new ConflictError(`Workspace slug '${input.slug}' is already in use`);
      }
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(newSlug ? { slug: newSlug } : {}),
      },
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      currentUserRole: membership.role as Role,
      membersCount: updated._count?.members ?? 0,
      projectsCount: updated._count?.projects ?? 0,
    };
  }

  /**
   * Deletes a workspace. Allowed ONLY for OWNER.
   */
  public async deleteWorkspace(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'workspace:delete');

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });
  }

  /**
   * Lists all members of a workspace. Requires members:read.
   */
  public async listMembers(userId: string, workspaceId: string): Promise<WorkspaceMemberResponse[]> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'members:read');

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role as Role,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      user: m.user,
    }));
  }

  /**
   * Adds an existing user by email to the workspace. Requires members:add (ADMIN or OWNER).
   * Admins cannot invite or assign the OWNER role.
   */
  public async addMember(
    userId: string,
    workspaceId: string,
    input: AddMemberInput,
  ): Promise<WorkspaceMemberResponse> {
    const actorMembership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(actorMembership.role as Role, 'members:add');

    if (actorMembership.role === 'ADMIN' && (input.role as string) === 'OWNER') {
      throw new ForbiddenError('Only workspace owners can assign the owner role');
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: USER_SELECT,
    });

    if (!targetUser) {
      throw new NotFoundError('User with this email was not found');
    }

    const existingMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictError('User is already a member of this workspace');
    }

    const newMember = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: targetUser.id,
        role: input.role as Role,
      },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
    });

    return {
      id: newMember.id,
      workspaceId: newMember.workspaceId,
      userId: newMember.userId,
      role: newMember.role as Role,
      createdAt: newMember.createdAt,
      updatedAt: newMember.updatedAt,
      user: newMember.user,
    };
  }

  /**
   * Updates an existing member's role. Enforces safety guardrails:
   * 1. Admin cannot modify an Owner.
   * 2. Cannot demote the last Owner.
   */
  public async updateMemberRole(
    userId: string,
    workspaceId: string,
    targetMemberId: string,
    input: UpdateMemberRoleInput,
  ): Promise<WorkspaceMemberResponse> {
    const actorMembership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(actorMembership.role as Role, 'members:update');

    const targetMember = await prisma.workspaceMember.findFirst({
      where: {
        id: targetMemberId,
        workspaceId,
      },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Workspace member not found');
    }

    const ownerCount = await prisma.workspaceMember.count({
      where: {
        workspaceId,
        role: 'OWNER',
      },
    });

    const isTargetLastOwner = targetMember.role === 'OWNER' && ownerCount <= 1;

    assertMemberModificationSafety({
      actorRole: actorMembership.role as Role,
      targetRole: targetMember.role as Role,
      newRole: input.role,
      isTargetLastOwner,
      action: 'update_role',
    });

    const updated = await prisma.workspaceMember.update({
      where: { id: targetMember.id },
      data: {
        role: input.role,
      },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      userId: updated.userId,
      role: updated.role as Role,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      user: updated.user,
    };
  }

  /**
   * Removes a member from the workspace. Enforces safety guardrails:
   * 1. Admin cannot remove an Owner.
   * 2. Cannot remove the last Owner.
   */
  public async removeMember(userId: string, workspaceId: string, targetMemberId: string): Promise<void> {
    const actorMembership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(actorMembership.role as Role, 'members:remove');

    const targetMember = await prisma.workspaceMember.findFirst({
      where: {
        id: targetMemberId,
        workspaceId,
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Workspace member not found');
    }

    const ownerCount = await prisma.workspaceMember.count({
      where: {
        workspaceId,
        role: 'OWNER',
      },
    });

    const isTargetLastOwner = targetMember.role === 'OWNER' && ownerCount <= 1;

    assertMemberModificationSafety({
      actorRole: actorMembership.role as Role,
      targetRole: targetMember.role as Role,
      isTargetLastOwner,
      action: 'remove',
    });

    await prisma.workspaceMember.delete({
      where: { id: targetMember.id },
    });
  }
}

export const workspacesService = new WorkspacesService();
