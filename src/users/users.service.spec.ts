import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { EntityStatus, OrgRole } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import * as bcrypt from 'bcryptjs';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

jest.mock('bcryptjs');

const mockPrisma: any = {
  user: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
  organizationUserAffiliation: {
    findFirst: jest.fn(),
  },
};

mockPrisma.$transaction = jest.fn(
  async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
);

const baseUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  status: EntityStatus.ACTIVE,
  isSystemAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const systemAdmin: JwtPayload = {
  sub: 99,
  email: 'admin@example.com',
  isSystemAdmin: true,
  organizationId: null,
  role: null,
};

const athlete: JwtPayload = {
  sub: 12,
  email: 'athlete@example.com',
  isSystemAdmin: false,
  organizationId: 5,
  role: OrgRole.ATHLETE,
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('defaults isSystemAdmin to false', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue(baseUser);

      const result = await service.create({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed_password',
          isSystemAdmin: false,
        },
        select: expect.objectContaining({ id: true, isSystemAdmin: true }),
      });
      expect(result).toEqual(baseUser);
    });

    it('accepts isSystemAdmin true for system-admin creation flow', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({
        ...baseUser,
        isSystemAdmin: true,
      });

      await service.create({
        email: 'admin@example.com',
        name: 'Admin User',
        password: 'password123',
        isSystemAdmin: true,
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isSystemAdmin: true }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('lists all non-deleted users for system admins with filters and pagination', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);

      const result = await service.findAll({
        page: 2,
        limit: 5,
        q: 'test',
        status: EntityStatus.ACTIVE,
        organizationId: 5,
        teamId: 7,
        role: OrgRole.ATHLETE,
      });

      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              AND: [
                { isDeleted: false },
                { status: EntityStatus.ACTIVE },
                {
                  OR: [
                    { email: { contains: 'test', mode: 'insensitive' } },
                    { name: { contains: 'test', mode: 'insensitive' } },
                  ],
                },
              ],
            },
            {
              organizationAffiliations: {
                some: {
                  isDeleted: false,
                  organizationId: 5,
                  teamId: 7,
                  role: OrgRole.ATHLETE,
                },
              },
            },
          ],
        },
      });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result).toEqual({ count: 1, data: [baseUser] });
    });
  });

  describe('findById', () => {
    it('returns a non-deleted user by id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await service.findById(baseUser.id);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: baseUser.id, isDeleted: false },
        select: expect.objectContaining({
          id: true,
          email: true,
          isSystemAdmin: true,
        }),
      });
      expect(result).toEqual(baseUser);
    });

    it('throws 404 when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const err = await service.findById(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update', () => {
    it('updates a user profile and revokes refresh tokens when email changes', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: baseUser.id,
        email: 'old@example.com',
      });
      mockPrisma.user.update.mockResolvedValue({
        ...baseUser,
        email: 'new@example.com',
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.update(baseUser.id, {
        email: 'new@example.com',
        name: 'New Name',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { email: 'new@example.com', name: 'New Name' },
        select: expect.objectContaining({ id: true }),
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.email).toBe('new@example.com');
    });

    it('rejects empty profile updates', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: athlete.sub,
        email: athlete.email,
      });

      await expect(service.update(athlete.sub, {})).rejects.toThrow(
        ApiException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('updates status and revokes refresh tokens when set to inactive', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: baseUser.id });
      mockPrisma.user.update.mockResolvedValue({
        ...baseUser,
        status: EntityStatus.INACTIVE,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateStatus(
        baseUser.id,
        { status: EntityStatus.INACTIVE },
        systemAdmin,
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { status: EntityStatus.INACTIVE },
        select: expect.objectContaining({ status: true }),
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(EntityStatus.INACTIVE);
    });

    it('rejects self-deactivation', async () => {
      await expect(
        service.updateStatus(
          systemAdmin.sub,
          { status: EntityStatus.INACTIVE },
          systemAdmin,
        ),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('setSystemAdmin', () => {
    it('updates platform admin access and revokes refresh tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: baseUser.id });
      mockPrisma.user.update.mockResolvedValue({
        ...baseUser,
        isSystemAdmin: true,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setSystemAdmin(
        baseUser.id,
        { isSystemAdmin: true },
        systemAdmin,
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { isSystemAdmin: true },
        select: expect.objectContaining({ isSystemAdmin: true }),
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.isSystemAdmin).toBe(true);
    });

    it('rejects self-demotion', async () => {
      await expect(
        service.setSystemAdmin(
          systemAdmin.sub,
          { isSystemAdmin: false },
          systemAdmin,
        ),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('softDelete', () => {
    it('soft deletes the user and revokes refresh tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: baseUser.id });
      mockPrisma.user.update.mockResolvedValue({ id: baseUser.id });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.softDelete(baseUser.id, systemAdmin);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
        select: { id: true },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects self-delete', async () => {
      await expect(
        service.softDelete(systemAdmin.sub, systemAdmin),
      ).rejects.toThrow(ApiException);
    });
  });
});
