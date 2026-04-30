import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('throws 401 when user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login('unknown@example.com', 'pass1234')).rejects.toThrow(
        ApiException,
      );
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

      await expect(service.login('user@example.com', 'wrongpassword')).rejects.toThrow(
        ApiException,
      );
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
          role: 'ORG_ADMIN',
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
        role: 'ORG_ADMIN',
        teamId: null,
      });
    });
  });

  describe('refreshAccessToken', () => {
    it('throws 401 when refresh token is not found in DB', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshAccessToken('unknown-uuid')).rejects.toThrow(ApiException);
    });

    it('throws 401 when refresh token is expired', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 1, email: 'u@e.com', isSystemAdmin: false },
      });

      await expect(service.refreshAccessToken('any-uuid')).rejects.toThrow(ApiException);
    });

    it('returns new accessToken and rotates refresh token', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 10,
        userId: 1,
        expiresAt: new Date(Date.now() + 100_000),
        user: {
          id: 1,
          email: 'u@e.com',
          isSystemAdmin: false,
          organizationAffiliations: [],
        },
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 11 });

      const result = await service.refreshAccessToken('valid-uuid');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(typeof result.newRawRefreshToken).toBe('string');
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10 }, data: { isRevoked: true } }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the refresh token when it exists', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(1, 'some-raw-token');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 1 }),
        data: { isRevoked: true },
      });
    });

    it('completes without error when no refresh token is provided', async () => {
      await expect(service.logout(1, undefined)).resolves.not.toThrow();
    });
  });

  describe('getMe', () => {
    it('returns user profile merged with jwt context', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'u@e.com',
        name: 'User',
        isSystemAdmin: false,
      });

      const result = await service.getMe(1, 5, 'ORG_ADMIN');

      expect(result).toMatchObject({
        id: 1,
        email: 'u@e.com',
        name: 'User',
        isSystemAdmin: false,
        organizationId: 5,
        role: 'ORG_ADMIN',
      });
    });

    it('throws 404 when user is not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getMe(999, null, null)).rejects.toThrow(ApiException);
    });
  });

  describe('getUserOrgs', () => {
    it('returns mapped org affiliations for user', async () => {
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
    });

    it('returns empty array when user has no affiliations', async () => {
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      const result = await service.getUserOrgs(1);

      expect(result).toEqual([]);
    });
  });

  describe('chooseOrg', () => {
    it('throws 403 when user has no affiliation with the org', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      await expect(service.chooseOrg(1, 99)).rejects.toThrow(ApiException);
    });

    it('returns access token with org context when affiliation exists', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        userId: 1,
        organizationId: 5,
        role: 'ORG_ADMIN',
        user: { id: 1, email: 'u@e.com', isSystemAdmin: false },
      });

      const result = await service.chooseOrg(1, 5);

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 5, role: 'ORG_ADMIN' }),
      );
    });
  });

  describe('changePassword', () => {
    it('throws 400 when current password is incorrect', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        passwordHash: '$2a$10$incorrecthash',
      });

      await expect(service.changePassword(1, 'wrongcurrent', 'newpass12')).rejects.toThrow(
        ApiException,
      );
    });

    it('updates password hash and revokes all refresh tokens', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('oldpassword', 10);

      mockPrisma.user.findFirst.mockResolvedValue({ id: 1, passwordHash: hash });
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
});
