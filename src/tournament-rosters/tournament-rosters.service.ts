import { Injectable } from '@nestjs/common';
import {
  AffiliationStatus,
  EntityStatus,
  OrgRole,
  Prisma,
  RosterRole,
  RosterStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateTournamentRosterDto } from './dto/create-tournament-roster.dto';
import { UpdateTournamentRosterDto } from './dto/update-tournament-roster.dto';
import { TournamentRosterResponseDto } from './dto/tournament-roster-response.dto';

export const tournamentRosterSelect = {
  id: true,
  tournamentId: true,
  tournamentTeamId: true,
  userId: true,
  role: true,
  jerseyNumberSnapshot: true,
  displayNameSnapshot: true,
  status: true,
} satisfies Prisma.TournamentRosterSelect;

type TournamentRosterRow = Prisma.TournamentRosterGetPayload<{
  select: typeof tournamentRosterSelect;
}>;

@Injectable()
export class TournamentRostersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: number,
    tournamentTeamId: number,
  ): Promise<TournamentRosterResponseDto[]> {
    await this.findRegistrationOrThrow(organizationId, tournamentTeamId);

    const rows = await this.prisma.tournamentRoster.findMany({
      where: {
        tournamentTeamId,
        status: RosterStatus.ACTIVE,
        isDeleted: false,
      },
      orderBy: [{ role: 'asc' }, { displayNameSnapshot: 'asc' }, { id: 'asc' }],
      select: tournamentRosterSelect,
    });

    return rows.map((row) => this.toResponse(row));
  }

  async create(
    actor: JwtPayload,
    dto: CreateTournamentRosterDto,
  ): Promise<TournamentRosterResponseDto> {
    const registration = await this.prisma.tournamentTeam.findFirst({
      where: {
        id: dto.tournamentTeamId,
        organizationId: actor.organizationId as number,
        isDeleted: false,
      },
      select: {
        id: true,
        tournamentId: true,
        teamId: true,
        status: true,
        tournament: { select: { status: true } },
      },
    });
    if (!registration) {
      throw ApiException.notFound('Tournament team not found');
    }

    this.assertMutable(registration.tournament.status);

    if (registration.status !== TournamentTeamStatus.ACTIVE) {
      throw ApiException.unprocessable(
        'The team registration is not active.',
        'INACTIVE_REGISTRATION',
      );
    }

    await this.assertActorTeamAccess(actor, registration.teamId);

    const member = await this.resolveMember(
      actor.organizationId as number,
      registration.teamId,
      dto.userId,
      dto.role,
    );

    const existing = await this.prisma.tournamentRoster.findFirst({
      where: {
        tournamentTeamId: registration.id,
        userId: dto.userId,
        isDeleted: false,
      },
      select: { id: true, status: true },
    });

    if (existing?.status === RosterStatus.ACTIVE) {
      throw ApiException.conflict(
        'This user already has an active roster entry for this registration.',
        'DUPLICATE_RECORD',
      );
    }

    if (dto.role === RosterRole.ATHLETE) {
      const otherTeamActive = await this.prisma.tournamentRoster.findFirst({
        where: {
          tournamentId: registration.tournamentId,
          userId: dto.userId,
          role: RosterRole.ATHLETE,
          status: RosterStatus.ACTIVE,
          isDeleted: false,
          tournamentTeamId: { not: registration.id },
        },
        select: { id: true },
      });
      if (otherTeamActive) {
        throw ApiException.conflict(
          'This athlete is already active for another team in the tournament.',
          'ATHLETE_ALREADY_REGISTERED',
        );
      }
    }

    const jerseyNumber =
      dto.jerseyNumber === undefined ? member.jerseyNumber : dto.jerseyNumber;

    if (existing) {
      return this.toResponse(
        await this.prisma.tournamentRoster.update({
          where: { id: existing.id },
          data: {
            organizationUserAffiliationId: member.affiliationId,
            role: dto.role,
            jerseyNumberSnapshot: jerseyNumber,
            status: RosterStatus.ACTIVE,
            leftAt: null,
          },
          select: tournamentRosterSelect,
        }),
      );
    }

    return this.toResponse(
      await this.prisma.tournamentRoster.create({
        data: {
          organizationId: actor.organizationId as number,
          tournamentId: registration.tournamentId,
          tournamentTeamId: registration.id,
          userId: dto.userId,
          organizationUserAffiliationId: member.affiliationId,
          role: dto.role,
          jerseyNumberSnapshot: jerseyNumber,
          displayNameSnapshot: member.displayName,
          joinedAt: new Date(),
        },
        select: tournamentRosterSelect,
      }),
    );
  }

  async update(
    actor: JwtPayload,
    id: number,
    dto: UpdateTournamentRosterDto,
  ): Promise<TournamentRosterResponseDto> {
    const target = await this.findTargetOrThrow(
      actor.organizationId as number,
      id,
    );
    this.assertMutable(target.tournament.status);

    if (target.status !== RosterStatus.ACTIVE) {
      throw ApiException.unprocessable(
        'The roster entry is not active.',
        'INACTIVE_REGISTRATION',
      );
    }

    await this.assertActorTeamAccess(actor, target.tournamentTeam.teamId);

    if (dto.role !== undefined) {
      const affiliation =
        await this.prisma.organizationUserAffiliation.findFirst({
          where: {
            userId: target.userId,
            organizationId: actor.organizationId as number,
            teamId: target.tournamentTeam.teamId,
            status: AffiliationStatus.ACTIVE,
            isDeleted: false,
          },
          select: { id: true, role: true },
        });
      if (!affiliation) {
        throw ApiException.unprocessable(
          'The user does not have an active affiliation with this team.',
          'INVALID_ROSTER_MEMBER',
        );
      }
      if ((affiliation.role as string) !== (dto.role as string)) {
        throw ApiException.unprocessable(
          "The user's active affiliation role does not match the roster role.",
          'INVALID_ROSTER_ROLE',
        );
      }

      if (dto.role === RosterRole.ATHLETE) {
        const otherTeamActive = await this.prisma.tournamentRoster.findFirst({
          where: {
            tournamentId: target.tournamentId,
            userId: target.userId,
            role: RosterRole.ATHLETE,
            status: RosterStatus.ACTIVE,
            isDeleted: false,
            tournamentTeamId: { not: target.tournamentTeamId },
          },
          select: { id: true },
        });
        if (otherTeamActive) {
          throw ApiException.conflict(
            'This athlete is already active for another team in the tournament.',
            'ATHLETE_ALREADY_REGISTERED',
          );
        }
      }
    }

    const data: Prisma.TournamentRosterUpdateInput = {
      ...(dto.role === undefined ? {} : { role: dto.role }),
      ...(dto.jerseyNumber === undefined
        ? {}
        : { jerseyNumberSnapshot: dto.jerseyNumber }),
    };

    const { tournament, tournamentTeam, ...currentRow } = target;
    void tournament;
    void tournamentTeam;
    if (Object.keys(data).length === 0) return this.toResponse(currentRow);

    return this.toResponse(
      await this.prisma.tournamentRoster.update({
        where: { id },
        data,
        select: tournamentRosterSelect,
      }),
    );
  }

  async remove(actor: JwtPayload, id: number): Promise<void> {
    const target = await this.findTargetOrThrow(
      actor.organizationId as number,
      id,
    );
    this.assertMutable(target.tournament.status);
    await this.assertActorTeamAccess(actor, target.tournamentTeam.teamId);

    if (target.status === RosterStatus.INACTIVE) return;

    await this.prisma.tournamentRoster.update({
      where: { id },
      data: { status: RosterStatus.INACTIVE, leftAt: new Date() },
    });
  }

  private async findTargetOrThrow(
    organizationId: number,
    id: number,
  ): Promise<
    TournamentRosterRow & {
      tournament: { status: TournamentStatus };
      tournamentTeam: { teamId: number };
    }
  > {
    const target = await this.prisma.tournamentRoster.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: {
        ...tournamentRosterSelect,
        tournament: { select: { status: true } },
        tournamentTeam: { select: { teamId: true } },
      },
    });
    if (!target) {
      throw ApiException.notFound('Tournament roster not found');
    }
    return target;
  }

  private async assertActorTeamAccess(
    actor: JwtPayload,
    teamId: number,
  ): Promise<void> {
    if (actor.role === OrgRole.ORG_ADMIN) return;
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: {
          userId: actor.sub,
          organizationId: actor.organizationId as number,
          teamId,
          role: actor.role as OrgRole,
          status: AffiliationStatus.ACTIVE,
          isDeleted: false,
        },
        select: { id: true },
      },
    );
    if (!affiliation) {
      throw ApiException.forbidden(
        'You can only manage the roster of your current team.',
      );
    }
  }

  private async resolveMember(
    organizationId: number,
    teamId: number,
    userId: number,
    role: RosterRole,
  ): Promise<{
    affiliationId: number;
    jerseyNumber: number | null;
    displayName: string;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false, status: EntityStatus.ACTIVE },
      select: { id: true, name: true },
    });
    if (!user) {
      throw ApiException.unprocessable(
        'The user is not active.',
        'INVALID_ROSTER_MEMBER',
      );
    }

    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: {
          userId,
          organizationId,
          teamId,
          status: AffiliationStatus.ACTIVE,
          isDeleted: false,
        },
        select: { id: true, role: true, jerseyNumber: true },
      },
    );
    if (!affiliation) {
      throw ApiException.unprocessable(
        'The user does not have an active affiliation with this team.',
        'INVALID_ROSTER_MEMBER',
      );
    }
    if ((affiliation.role as string) !== (role as string)) {
      throw ApiException.unprocessable(
        "The user's active affiliation role does not match the roster role.",
        'INVALID_ROSTER_ROLE',
      );
    }

    return {
      affiliationId: affiliation.id,
      jerseyNumber: affiliation.jerseyNumber,
      displayName: user.name,
    };
  }

  private assertMutable(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'The tournament no longer accepts registration changes.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private async findRegistrationOrThrow(
    organizationId: number,
    tournamentTeamId: number,
  ): Promise<{ id: number }> {
    const registration = await this.prisma.tournamentTeam.findFirst({
      where: { id: tournamentTeamId, organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!registration) {
      throw ApiException.notFound('Tournament team not found');
    }
    return registration;
  }

  private toResponse(row: TournamentRosterRow): TournamentRosterResponseDto {
    const { jerseyNumberSnapshot, ...rest } = row;
    return { ...rest, jerseyNumber: jerseyNumberSnapshot };
  }
}
