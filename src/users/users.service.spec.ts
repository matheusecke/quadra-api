// src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

const mockPrisma = {
  user: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('hashes the password and creates a user', async () => {
      const FAKE_HASH = 'hashed_password';
      (bcrypt.hash as jest.Mock).mockResolvedValue(FAKE_HASH);

      const dto = { email: 'test@example.com', name: 'Test User', password: 'password123' };
      const fakeUser = { id: 1, email: dto.email, name: dto.name, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.user.create.mockResolvedValue(fakeUser);

      const result = await service.create(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: FAKE_HASH }) }),
      );
      expect(result).toEqual(fakeUser);
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const fakeUser = { id: 1, email: 'a@b.com', name: 'A', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
      mockPrisma.user.findFirst.mockResolvedValue(fakeUser);

      const result = await service.findById(1);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: expect.objectContaining({ id: true, email: true }),
      });
      expect(result).toEqual(fakeUser);
    });

    it('throws NOT_FOUND when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const err = await service.findById(99).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
