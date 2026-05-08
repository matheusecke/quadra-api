import { Injectable } from '@nestjs/common';
import { EntityStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<OrganizationResponseDto> {
    const slug = slugify(dto.name);

    const existing = await this.prisma.organization.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      throw ApiException.conflict(
        'An organization with this name already exists.',
        'DUPLICATE_RECORD',
      );
    }

    return this.prisma.organization.create({
      data: { name: dto.name, slug },
      select: organizationSelect,
    });
  }

  async findAll(
    query: ListOrganizationsQueryDto,
  ): Promise<{ count: number; data: OrganizationResponseDto[] }> {
    const filters: Prisma.OrganizationWhereInput[] = [{ isDeleted: false }];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }

    const where: Prisma.OrganizationWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: organizationSelect,
      }),
    ]);

    return { count, data };
  }

  async findById(id: number): Promise<OrganizationResponseDto> {
    const org = await this.prisma.organization.findFirst({
      where: { id, isDeleted: false },
      select: organizationSelect,
    });

    if (!org) {
      throw ApiException.notFound('Organization not found');
    }

    return org;
  }

  async update(
    id: number,
    dto: UpdateOrganizationDto,
    user: JwtPayload,
  ): Promise<OrganizationResponseDto> {
    const existing = await this.prisma.organization.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, slug: true },
    });

    if (!existing) {
      throw ApiException.notFound('Organization not found');
    }

    if (
      !user.isSystemAdmin &&
      !(user.role === OrgRole.ORG_ADMIN && user.organizationId === id)
    ) {
      throw ApiException.forbidden(
        'You do not have permission to update this organization.',
      );
    }

    const newSlug = slugify(dto.name);

    if (newSlug !== existing.slug) {
      const conflict = await this.prisma.organization.findFirst({
        where: { slug: newSlug, isDeleted: false, id: { not: id } },
        select: { id: true },
      });

      if (conflict) {
        throw ApiException.conflict(
          'An organization with this name already exists.',
          'DUPLICATE_RECORD',
        );
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data: { name: dto.name, slug: newSlug },
      select: organizationSelect,
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateOrganizationStatusDto,
  ): Promise<OrganizationResponseDto> {
    const existing = await this.prisma.organization.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id },
      data: { status: dto.status },
      select: organizationSelect,
    });
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.prisma.organization.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Organization not found');
    }

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      }),
      this.prisma.refreshToken.updateMany({
        where: { organizationId: id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);
  }
}
