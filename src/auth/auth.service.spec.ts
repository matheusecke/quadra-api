import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OrgRole } from '@prisma/client';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { UsersService } from '../users/users.service';
import { InviteDecision } from '../organization-user-affiliations/dto/user-invite-response.dto';
import { OrganizationUserAffiliationsService } from '../organization-user-affiliations/organization-user-affiliations.service';
import { RespondToMyInviteDto } from './dto/respond-to-my-invite.dto';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  organizationUserAffiliation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed-jwt-token'),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
    return undefined;
  }),
  getOrThrow: jest.fn(),
};

const mockUsersService = {
  create: jest.fn(),
};

const mockOrganizationUserAffiliationsService = {
  findPendingInvitesForUser: jest.fn(),
  respondToInviteForUser: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: OrganizationUserAffiliationsService,
          useValue: mockOrganizationUserAffiliationsService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates an active non-admin user, signs tokens, and returns no organizations', async () => {
      const expectedBirthDate = new Date('1998-04-23T00:00:00.000Z');
      mockUsersService.create.mockResolvedValue({
        id: 1,
        email: 'new@example.com',
        name: 'New User',
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.register({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
        birthDate: '1998-04-23',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith(
        {
          email: 'new@example.com',
          name: 'New User',
          password: 'password123',
          birthDate: expectedBirthDate,
          height: null,
          isSystemAdmin: false,
        },
        mockPrisma,
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        email: 'new@example.com',
        isSystemAdmin: false,
        organizationId: null,
        role: null,
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        accessToken: 'signed-jwt-token',
        user: {
          id: 1,
          email: 'new@example.com',
          name: 'New User',
          isSystemAdmin: false,
        },
        organizations: [],
      });
      expect(typeof result.rawRefreshToken).toBe('string');
    });

    it('passes birth date and nullable height to user creation', async () => {
      const expectedBirthDate = new Date('1998-04-23T00:00:00.000Z');
      mockUsersService.create.mockResolvedValue({
        id: 4,
        email: 'profile@example.com',
        name: 'Profile User',
        isSystemAdmin: false,
        status: 'ACTIVE',
        birthDate: expectedBirthDate,
        heightCm: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 4 });

      await service.register({
        email: 'profile@example.com',
        name: 'Profile User',
        password: 'password123',
        birthDate: '1998-04-23',
        height: null,
      } as any);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        {
          email: 'profile@example.com',
          name: 'Profile User',
          password: 'password123',
          birthDate: expectedBirthDate,
          height: null,
          isSystemAdmin: false,
        },
        mockPrisma,
      );
    });

    it('passes null height when register height is omitted', async () => {
      const expectedBirthDate = new Date('1998-04-23T00:00:00.000Z');
      mockUsersService.create.mockResolvedValue({
        id: 5,
        email: 'noheight@example.com',
        name: 'No Height',
        isSystemAdmin: false,
        status: 'ACTIVE',
        birthDate: expectedBirthDate,
        heightCm: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 5 });

      await service.register({
        email: 'noheight@example.com',
        name: 'No Height',
        password: 'password123',
        birthDate: '1998-04-23',
      } as any);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ height: null }),
        mockPrisma,
      );
    });

    it('does not allow registration to create a system admin user', async () => {
      const expectedBirthDate = new Date('1998-04-23T00:00:00.000Z');
      mockUsersService.create.mockResolvedValue({
        id: 2,
        email: 'client@example.com',
        name: 'Client User',
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 2 });

      await service.register({
        email: 'client@example.com',
        name: 'Client User',
        password: 'password123',
        birthDate: '1998-04-23',
        isSystemAdmin: true,
      } as any);

      expect(mockUsersService.create).toHaveBeenCalledWith(
        {
          email: 'client@example.com',
          name: 'Client User',
          password: 'password123',
          birthDate: expectedBirthDate,
          height: null,
          isSystemAdmin: false,
        },
        mockPrisma,
      );
    });

    it('rejects the registration transaction when refresh token creation fails', async () => {
      const expectedBirthDate = new Date('1998-04-23T00:00:00.000Z');
      mockUsersService.create.mockResolvedValue({
        id: 3,
        email: 'rollback@example.com',
        name: 'Rollback User',
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.refreshToken.create.mockRejectedValue(new Error('db error'));

      await expect(
        service.register({
          email: 'rollback@example.com',
          name: 'Rollback User',
          password: 'password123',
          birthDate: '1998-04-23',
        }),
      ).rejects.toThrow('db error');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockUsersService.create).toHaveBeenCalledWith(
        {
          email: 'rollback@example.com',
          name: 'Rollback User',
          password: 'password123',
          birthDate: expectedBirthDate,
          height: null,
          isSystemAdmin: false,
        },
        mockPrisma,
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('throws 401 when user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login('unknown@example.com', 'pass1234'),
      ).rejects.toThrow(ApiException);
    });

    it('throws 401 when password does not match', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        name: 'User',
        passwordHash: '$2a$10$invalidhash',
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await expect(
        service.login('user@example.com', 'wrongpassword'),
      ).rejects.toThrow(ApiException);
    });

    it('queries only active non-deleted users before checking the password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login('inactive@example.com', 'correctpass'),
      ).rejects.toThrow(ApiException);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: 'inactive@example.com',
          isDeleted: false,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          isSystemAdmin: true,
          status: true,
        },
      });
      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).not.toHaveBeenCalled();
    });

    it('returns login result with accessToken when credentials are valid', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('correctpass', 10);

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        name: 'User',
        passwordHash: hash,
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login('user@example.com', 'correctpass');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.user.id).toBe(1);
      expect(result.organizations).toEqual([]);
      expect(typeof result.rawRefreshToken).toBe('string');
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('maps org affiliations into the login response', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('pass1234', 10);

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 2,
        email: 'admin@example.com',
        name: 'Admin',
        passwordHash: hash,
        isSystemAdmin: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        {
          organizationId: 5,
          role: OrgRole.ORG_ADMIN,
          teamId: null,
          organization: { id: 5, name: 'Clube A', slug: 'clube-a' },
        },
      ]);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login('admin@example.com', 'pass1234');

      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]).toMatchObject({
        organizationId: 5,
        organizationName: 'Clube A',
        organizationSlug: 'clube-a',
        role: OrgRole.ORG_ADMIN,
        teamId: null,
      });
      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            organization: {
              is: { isDeleted: false, status: 'ACTIVE' },
            },
            OR: [
              { teamId: null },
              { team: { is: { isDeleted: false, status: 'ACTIVE' } } },
            ],
          }),
        }),
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('throws 401 when refresh token is not found in DB', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshAccessToken('unknown-uuid')).rejects.toThrow(
        ApiException,
      );
    });

    it('throws 401 when refresh token is expired', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() - 1000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });

      await expect(service.refreshAccessToken('any-uuid')).rejects.toThrow(
        ApiException,
      );
    });

    it('revokes and rejects when refresh token user is inactive', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'INACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshAccessToken('valid-uuid')).rejects.toThrow(
        ApiException,
      );

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 10, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('revokes and rejects when refresh token user is deleted', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: true,
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshAccessToken('valid-uuid')).rejects.toThrow(
        ApiException,
      );

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 10, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('returns new accessToken and rotates refresh token', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 11 });

      const result = await service.refreshAccessToken('valid-uuid');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(typeof result.newRawRefreshToken).toBe('string');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10, isRevoked: false },
          data: { isRevoked: true },
        }),
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, organizationId: null }),
      });
    });

    it('preserves org context when refresh token organization is still active', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: 5,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        organizationId: 5,
        role: OrgRole.ORG_ADMIN,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 11 });

      await service.refreshAccessToken('valid-uuid');

      expect(
        mockPrisma.organizationUserAffiliation.findFirst,
      ).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 1,
          organizationId: 5,
          isDeleted: false,
          organization: {
            is: { isDeleted: false, status: 'ACTIVE' },
          },
        }),
        select: { organizationId: true, role: true },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 5, role: OrgRole.ORG_ADMIN }),
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, organizationId: 5 }),
      });
    });

    it('rejects concurrent refresh reuse when the token was already consumed', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshAccessToken('valid-uuid')).rejects.toThrow(
        ApiException,
      );

      expect(mockJwtService.sign).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('falls back to global context when refresh token organization is no longer active', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        organizationId: 5,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 11 });

      await service.refreshAccessToken('valid-uuid');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: null, role: null }),
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, organizationId: null }),
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token when it exists', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-raw-token');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tokenHash: expect.any(String),
          isRevoked: false,
        }),
        data: { isRevoked: true },
      });
      expect(
        mockPrisma.refreshToken.updateMany.mock.calls[0][0].where,
      ).not.toHaveProperty('userId');
    });

    it('completes without error when no refresh token is provided', async () => {
      await expect(service.logout(undefined)).resolves.not.toThrow();
    });
  });

  describe('getMe', () => {
    it('returns user profile merged with jwt context', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'u@e.com',
        name: 'User',
        isSystemAdmin: false,
        status: 'ACTIVE',
        isDeleted: false,
      });

      const result = await service.getMe(1, 5, OrgRole.ORG_ADMIN);

      expect(result).toMatchObject({
        id: 1,
        email: 'u@e.com',
        name: 'User',
        isSystemAdmin: false,
        organizationId: 5,
        role: OrgRole.ORG_ADMIN,
      });
    });

    it('throws 404 when user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getMe(999, null, null)).rejects.toThrow(
        ApiException,
      );
    });

    it('throws 404 for inactive or deleted users', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getMe(1, null, null)).rejects.toThrow(ApiException);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false, status: 'ACTIVE' },
        select: { id: true, email: true, name: true, isSystemAdmin: true },
      });
    });
  });

  describe('getUserOrgs', () => {
    it('returns mapped org affiliations for user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        {
          organizationId: 3,
          role: 'TEAM_ADMIN',
          teamId: 7,
          organization: { id: 3, name: 'Clube B', slug: 'clube-b' },
        },
      ]);

      const result = await service.getUserOrgs(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        organizationId: 3,
        organizationName: 'Clube B',
        organizationSlug: 'clube-b',
        role: 'TEAM_ADMIN',
        teamId: 7,
      });
      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            isDeleted: false,
            organization: {
              is: { isDeleted: false, status: 'ACTIVE' },
            },
          }),
        }),
      );
    });

    it('filters org affiliations by organization name when provided', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.getUserOrgs(1, { name: 'clube' });

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: {
              is: {
                isDeleted: false,
                status: 'ACTIVE',
                name: { contains: 'clube', mode: 'insensitive' },
              },
            },
          }),
        }),
      );
    });

    it('returns empty array when user has no affiliations', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      const result = await service.getUserOrgs(1);

      expect(result).toEqual([]);
    });

    it('throws 404 before listing affiliations for inactive or deleted users', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getUserOrgs(1)).rejects.toThrow(ApiException);

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('chooseOrg', () => {
    it('throws 403 when user has no affiliation with the org', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      await expect(
        service.chooseOrg(1, 99, 'raw-refresh-token'),
      ).rejects.toThrow(ApiException);
    });

    it('returns access token with org context and rotates refresh token when affiliation exists', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        userId: 1,
        organizationId: 5,
        role: OrgRole.ORG_ADMIN,
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 20,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 21 });

      const result = await service.chooseOrg(1, 5, 'raw-refresh-token');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(typeof result.rawRefreshToken).toBe('string');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 5, role: OrgRole.ORG_ADMIN }),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 20, isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, organizationId: 5 }),
      });
    });

    it('rejects chooseOrg when the refresh token was already consumed', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 20,
        userId: 1,
        organizationId: null,
        expiresAt: new Date(Date.now() + 100_000),
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        userId: 1,
        organizationId: 5,
        role: OrgRole.ORG_ADMIN,
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          status: 'ACTIVE',
          isDeleted: false,
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.chooseOrg(1, 5, 'raw-refresh-token'),
      ).rejects.toThrow(ApiException);

      expect(mockJwtService.sign).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('throws 400 when current password is incorrect', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: '$2a$10$incorrecthash',
      });

      await expect(
        service.changePassword(1, 'wrongcurrent', 'newpass12'),
      ).rejects.toThrow(ApiException);
    });

    it('throws 404 for inactive or deleted users', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(1, 'oldpassword', 'newpassword1'),
      ).rejects.toThrow(ApiException);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false, status: 'ACTIVE' },
        select: { id: true, passwordHash: true },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates password hash and revokes all refresh tokens', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('oldpassword', 10);

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: hash,
      });
      mockPrisma.user.update = jest.fn().mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.changePassword(1, 'oldpassword', 'newpassword1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, isRevoked: false },
        data: { isRevoked: true },
      });
    });
  });

  describe('getRefreshCookieMaxAgeMs', () => {
    it('uses the configured refresh token expiry for cookie maxAge', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '2h';
        return undefined;
      });

      expect(service.getRefreshCookieMaxAgeMs()).toBe(7_200_000);
    });
  });

  describe('RespondToMyInviteDto', () => {
    it('accepts ACCEPT and REJECT decisions', async () => {
      const acceptDto = Object.assign(new RespondToMyInviteDto(), {
        decision: InviteDecision.ACCEPT,
      });
      const rejectDto = Object.assign(new RespondToMyInviteDto(), {
        decision: InviteDecision.REJECT,
      });

      await expect(validate(acceptDto)).resolves.toHaveLength(0);
      await expect(validate(rejectDto)).resolves.toHaveLength(0);
    });

    it('rejects unsupported decisions', async () => {
      const dto = Object.assign(new RespondToMyInviteDto(), {
        decision: 'MAYBE',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isEnum');
    });
  });

  describe('invites', () => {
    it('delegates getInvites to OrganizationUserAffiliationsService', async () => {
      mockOrganizationUserAffiliationsService.findPendingInvitesForUser.mockResolvedValue(
        [{ id: 1 }],
      );

      await expect(service.getInvites(5)).resolves.toEqual([{ id: 1 }]);

      expect(
        mockOrganizationUserAffiliationsService.findPendingInvitesForUser,
      ).toHaveBeenCalledWith(5);
    });

    it('delegates respondToInvite to OrganizationUserAffiliationsService', async () => {
      mockOrganizationUserAffiliationsService.respondToInviteForUser.mockResolvedValue(
        { id: 1 },
      );

      await expect(
        service.respondToInvite(5, 1, InviteDecision.ACCEPT),
      ).resolves.toEqual({ id: 1 });

      expect(
        mockOrganizationUserAffiliationsService.respondToInviteForUser,
      ).toHaveBeenCalledWith(5, 1, InviteDecision.ACCEPT);
    });
  });
});
