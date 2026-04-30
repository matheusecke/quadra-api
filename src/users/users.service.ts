// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiException } from '../common/exceptions/api.exception';
import * as bcrypt from 'bcryptjs';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetSystemAdminDto } from './dto/set-system-admin.dto';

const userSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  isSystemAdmin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserWhere = Prisma.UserWhereInput;
type UserWriteClient = Pick<PrismaService, 'user'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateUserDto,
    client: UserWriteClient = this.prisma,
  ): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await client.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        isSystemAdmin: dto.isSystemAdmin ?? false,
      },
      select: userSelect,
    });

    return user;
  }

  async findAll(
    query: ListUsersQueryDto,
  ): Promise<{ count: number; data: UserResponseDto[] }> {
    const where = this.buildListWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: userSelect,
      }),
    ]);

    return { count, data };
  }

  async findById(id: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: userSelect,
    });

    if (!user) {
      throw ApiException.notFound('User not found');
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const current = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, email: true },
    });

    if (!current) {
      throw ApiException.notFound('User not found');
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.name !== undefined) updateData.name = dto.name;

    if (Object.keys(updateData).length === 0) {
      throw ApiException.badRequest(
        'At least one profile field must be provided.',
        'EMPTY_UPDATE',
      );
    }

    if (dto.email !== undefined && dto.email !== current.email) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: updateData,
          select: userSelect,
        });

        await this.revokeRefreshTokens(id, tx);

        return user;
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateUserStatusDto,
    currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    if (id === currentUser.sub && dto.status === EntityStatus.INACTIVE) {
      throw ApiException.badRequest(
        'System admins cannot deactivate their own account.',
        'SELF_DEACTIVATION_NOT_ALLOWED',
      );
    }

    await this.ensureUserExists(id);

    if (dto.status === EntityStatus.INACTIVE) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { status: dto.status },
          select: userSelect,
        });

        await this.revokeRefreshTokens(id, tx);

        return user;
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: userSelect,
    });
  }

  async setSystemAdmin(
    id: number,
    dto: SetSystemAdminDto,
    currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    if (id === currentUser.sub && !dto.isSystemAdmin) {
      throw ApiException.badRequest(
        'System admins cannot remove their own platform admin access.',
        'SELF_DEMOTION_NOT_ALLOWED',
      );
    }

    await this.ensureUserExists(id);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { isSystemAdmin: dto.isSystemAdmin },
        select: userSelect,
      });

      await this.revokeRefreshTokens(id, tx);

      return user;
    });
  }

  async softDelete(id: number, currentUser: JwtPayload): Promise<void> {
    if (id === currentUser.sub) {
      throw ApiException.badRequest(
        'System admins cannot delete their own account.',
        'SELF_DELETE_NOT_ALLOWED',
      );
    }

    await this.ensureUserExists(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
        select: { id: true },
      });

      await this.revokeRefreshTokens(id, tx);
    });
  }

  private buildListWhere(query: ListUsersQueryDto): UserWhere {
    const filters = this.buildQueryFilters(query);
    return this.withOptionalAffiliationFilters(filters, query);
  }

  private buildQueryFilters(query: ListUsersQueryDto): UserWhere {
    const filters: UserWhere[] = [{ isDeleted: false }];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.q) {
      filters.push({
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: filters };
  }

  private withOptionalAffiliationFilters(
    where: UserWhere,
    query: ListUsersQueryDto,
  ): UserWhere {
    if (
      query.organizationId === undefined &&
      query.teamId === undefined &&
      query.role === undefined
    ) {
      return where;
    }

    return {
      AND: [
        where,
        {
          organizationAffiliations: {
            some: {
              isDeleted: false,
              ...(query.organizationId !== undefined
                ? { organizationId: query.organizationId }
                : {}),
              ...(query.teamId !== undefined ? { teamId: query.teamId } : {}),
              ...(query.role !== undefined ? { role: query.role } : {}),
            },
          },
        },
      ],
    };
  }

  private async ensureUserExists(id: number): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found');
    }
  }

  private async revokeRefreshTokens(
    userId: number,
    client: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<void> {
    await client.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
