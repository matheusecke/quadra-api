import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliationToken } from '../common/utils/affiliation-token.util';
import { ApiException } from '../common/exceptions/api.exception';
import { AffiliationStatus } from '@prisma/client';
import { CreateTeamAffiliationDto } from './dto/create-team-affiliation.dto';
import {
  InviteDecision,
  TeamInviteResponseDto,
} from './dto/team-invite-response.dto';
import { UpdateTeamAffiliationStatusDto } from './dto/update-team-affiliation-status.dto';
import { ListTeamAffiliationsQueryDto } from './dto/list-team-affiliations-query.dto';

const affiliationSelect = {
  id: true,
  organizationId: true,
  teamId: true,
  status: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class OrganizationTeamAffiliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orgId: number,
    dto: CreateTeamAffiliationDto,
    currentUserId: number,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId, isDeleted: false },
    });
    if (!team) throw ApiException.notFound('Team not found');

    const existing = await this.prisma.organizationTeamAffiliation.findFirst({
      where: {
        organizationId: orgId,
        teamId: dto.teamId,
        isDeleted: false,
        status: { in: [AffiliationStatus.PENDING, AffiliationStatus.ACTIVE] },
      },
    });
    if (existing)
      throw ApiException.conflict(
        'Team already has a pending or active affiliation with this organization',
      );

    const { raw, hash, expiresAt } = AffiliationToken.generate();

    const affiliation = await this.prisma.organizationTeamAffiliation.create({
      data: {
        organizationId: orgId,
        teamId: dto.teamId,
        status: AffiliationStatus.PENDING,
        createdByUserId: currentUserId,
        inviteToken: hash,
        inviteExpiresAt: expiresAt,
      },
      select: affiliationSelect,
    });

    return { affiliation, inviteToken: raw };
  }

  async findAll(orgId: number, query: ListTeamAffiliationsQueryDto) {
    const { page, limit, status, q, inviteExpired } = query;
    const skip = (page - 1) * limit;
    const where = {
      organizationId: orgId,
      isDeleted: false,
      ...(inviteExpired
        ? {
            status: AffiliationStatus.PENDING,
            inviteExpiresAt: { lt: new Date() },
          }
        : status
          ? { status }
          : {}),
      ...(q
        ? { team: { name: { contains: q, mode: 'insensitive' as const } } }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationTeamAffiliation.count({ where }),
      this.prisma.organizationTeamAffiliation.findMany({
        where,
        select: affiliationSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { count, data };
  }

  async findById(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
      select: affiliationSelect,
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return aff;
  }

  async respondToInvite(dto: TeamInviteResponseDto) {
    const tokenHash = AffiliationToken.hash(dto.token);
    const aff = await this.prisma.organizationTeamAffiliation.findFirst({
      where: { inviteToken: tokenHash, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Invite not found');
    if (aff.status !== AffiliationStatus.PENDING)
      throw ApiException.unprocessable('Invite is no longer pending');
    if (aff.inviteExpiresAt && aff.inviteExpiresAt < new Date())
      throw ApiException.unprocessable('Invite has expired');

    if (dto.decision === InviteDecision.ACCEPT) {
      return this.prisma.organizationTeamAffiliation.update({
        where: { id: aff.id },
        data: {
          status: AffiliationStatus.ACTIVE,
          inviteToken: null,
          inviteExpiresAt: null,
        },
        select: affiliationSelect,
      });
    }

    return this.prisma.organizationTeamAffiliation.update({
      where: { id: aff.id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
      select: affiliationSelect,
    });
  }

  async resend(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    if (aff.status !== AffiliationStatus.PENDING)
      throw ApiException.unprocessable(
        'Can only resend invite for PENDING affiliations',
      );

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const updated = await this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { inviteToken: hash, inviteExpiresAt: expiresAt },
      select: affiliationSelect,
    });
    return { affiliation: updated, inviteToken: raw };
  }

  async remove(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    await this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
    });
  }

  async updateStatus(
    orgId: number,
    id: number,
    dto: UpdateTeamAffiliationStatusDto,
  ) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { status: dto.status },
      select: affiliationSelect,
    });
  }

  async findByTeam(teamId: number, query: ListTeamAffiliationsQueryDto) {
    const { page, limit, status, q, inviteExpired } = query;
    const skip = (page - 1) * limit;
    const where = {
      teamId,
      isDeleted: false,
      ...(inviteExpired
        ? {
            status: AffiliationStatus.PENDING,
            inviteExpiresAt: { lt: new Date() },
          }
        : status
          ? { status }
          : {}),
      ...(q
        ? {
            organization: {
              name: { contains: q, mode: 'insensitive' as const },
            },
          }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationTeamAffiliation.count({ where }),
      this.prisma.organizationTeamAffiliation.findMany({
        where,
        select: affiliationSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { count, data };
  }
}
