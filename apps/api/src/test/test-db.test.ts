import { describe, it, expect, vi, afterEach } from 'vitest';
import { prisma } from '../db/prisma';
import { resetDatabase, disconnectDatabase } from './test-db';

describe('Test DB Helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('truncates all relevant tables with CASCADE in resetDatabase', async () => {
    const executeSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValueOnce(0 as never);

    await resetDatabase();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const sqlArg = executeSpy.mock.calls[0]?.[0] as string;
    expect(sqlArg).toContain('TRUNCATE TABLE');
    expect(sqlArg).toContain('CASCADE');
    expect(sqlArg).toContain('"users"');
    expect(sqlArg).toContain('"workspaces"');
    expect(sqlArg).toContain('"projects"');
    expect(sqlArg).toContain('"tasks"');
  });

  it('falls back to deleteMany on models when truncation fails or permissions are restricted', async () => {
    vi.spyOn(prisma, '$executeRawUnsafe').mockRejectedValueOnce(new Error('Permission denied'));

    const models = [
      'refreshToken',
      'comment',
      'sprintTask',
      'sprint',
      'task',
      'activityLog',
      'project',
      'workspaceMember',
      'workspace',
      'user',
    ] as const;

    const spies = models.map((model) =>
      vi.spyOn(prisma[model] as { deleteMany: () => Promise<unknown> }, 'deleteMany').mockResolvedValue({ count: 0 } as never),
    );

    await resetDatabase();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('disconnects prisma client in disconnectDatabase', async () => {
    const disconnectSpy = vi.spyOn(prisma, '$disconnect').mockResolvedValueOnce();

    await disconnectDatabase();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
