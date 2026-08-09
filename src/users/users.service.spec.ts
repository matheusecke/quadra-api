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
          heightCm: null,
          isSystemAdmin: false,
        },
        select: expect.objectContaining({
          id: true,
          birthDate: true,
          heightCm: true,
          isSystemAdmin: true,
        }),
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

    it('persists birth date and height in centimeters when creating a user', async () => {
      const birthDate = new Date('1998-04-23T00:00:00.000Z');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({
        ...baseUser,
        birthDate,
        heightCm: 182,
      });

      const result = await service.create({
        email: 'profile@example.com',
        name: 'Profile User',
        password: 'password123',
        birthDate,
        height: 182,
      } as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'profile@example.com',
          name: 'Profile User',
          passwordHash: 'hashed_password',
          isSystemAdmin: false,
          birthDate,
          heightCm: 182,
        },
        select: expect.objectContaining({
          id: true,
          birthDate: true,
          heightCm: true,
        }),
      });
      expect(result).toMatchObject({ birthDate, heightCm: 182 });
    });

    it('persists null height when height is explicitly null', async () => {
      const birthDate = new Date('1998-04-23T00:00:00.000Z');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({
        ...baseUser,
        birthDate,
        heightCm: null,
      });

      await service.create({
        email: 'nullable-height@example.com',
        name: 'Nullable Height',
        password: 'password123',
        birthDate,
        height: null,
      } as any);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'nullable-height@example.com',
          name: 'Nullable Height',
          passwordHash: 'hashed_password',
          isSystemAdmin: false,
          birthDate,
          heightCm: null,
        },
        select: expect.objectContaining({
          birthDate: true,
          heightCm: true,
        }),
      });
    });

    it('keeps admin creation compatible when birth date is omitted', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({
        ...baseUser,
        birthDate: new Date('1970-01-01T00:00:00.000Z'),
        heightCm: null,
      });

      await service.create({
        email: 'admin-compatible@example.com',
        name: 'Admin Compatible',
        password: 'password123',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'admin-compatible@example.com',
          name: 'Admin Compatible',
          passwordHash: 'hashed_password',
          isSystemAdmin: false,
          heightCm: null,
        },
        select: expect.objectContaining({
          birthDate: true,
          heightCm: true,
        }),
      });
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

    it('filters by isSystemAdmin=true', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);

      await service.findAll({ page: 1, limit: 10, isSystemAdmin: true });

      const where = mockPrisma.user.count.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ isSystemAdmin: true }]),
      );
    });

    it('filters by isSystemAdmin=false', async () => {
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);

      await service.findAll({ page: 1, limit: 10, isSystemAdmin: false });

      const where = mockPrisma.user.count.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ isSystemAdmin: false }]),
      );
    });

    it('does not add isSystemAdmin filter when absent', async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);

      await service.findAll({ page: 1, limit: 10 });

      const where = mockPrisma.user.count.mock.calls[0][0].where;
      const andFilters: unknown[] = where.AND as unknown[];
      const hasIsSystemAdmin = andFilters.some(
        (f) => typeof f === 'object' && f !== null && 'isSystemAdmin' in f,
      );
      expect(hasIsSystemAdmin).toBe(false);
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

  describe('lookupActiveByEmail', () => {
    it('returns only id, name, and email for an exact active email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 42,
        name: 'Marina Souza',
        email: 'marina@example.com',
      });

      await expect(
        service.lookupActiveByEmail('marina@example.com'),
      ).resolves.toEqual({
        id: 42,
        name: 'Marina Souza',
        email: 'marina@example.com',
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: { equals: 'marina@example.com', mode: 'insensitive' },
          status: EntityStatus.ACTIVE,
          isDeleted: false,
        },
        select: { id: true, name: true, email: true },
      });
    });

    it('returns the same 404 for missing, inactive, and deleted users', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.lookupActiveByEmail('missing@example.com'),
      ).rejects.toMatchObject({ status: 404 });
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
