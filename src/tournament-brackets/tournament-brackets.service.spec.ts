import { HttpStatus } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentBracketsService,
  bracketReadSelect,
} from './tournament-brackets.service';

type AsyncMock = jest.Mock<(input?: unknown) => Promise<unknown>>;

const createAsyncMock = (): AsyncMock =>
  jest.fn<(input?: unknown) => Promise<unknown>>();

type MockPrisma = {
  tournament: { findFirst: AsyncMock };
  tournamentBracketRound: {
    findMany: AsyncMock;
    findFirst: AsyncMock;
    create: AsyncMock;
    update: AsyncMock;
  };
  tournamentBracketSlot: {
    findFirst: AsyncMock;
    create: AsyncMock;
    update: AsyncMock;
  };
  tournamentTeam: { findFirst: AsyncMock };
};

const mockPrisma: MockPrisma = {
  tournament: { findFirst: createAsyncMock() },
  tournamentBracketRound: {
    findMany: createAsyncMock(),
    findFirst: createAsyncMock(),
    create: createAsyncMock(),
    update: createAsyncMock(),
  },
  tournamentBracketSlot: {
    findFirst: createAsyncMock(),
    create: createAsyncMock(),
    update: createAsyncMock(),
  },
  tournamentTeam: { findFirst: createAsyncMock() },
};

const readSlotRow = {
  id: 101,
  position: 1,
  label: null as string | null,
  winnerTournamentTeamId: null as number | null,
  homeTournamentTeam: {
    id: 21,
    displayNameSnapshot: 'Engenharia',
    team: { shortName: 'ENG' },
  } as { id: number; displayNameSnapshot: string; team: { shortName: string } } | null,
  awayTournamentTeam: null as
    | { id: number; displayNameSnapshot: string; team: { shortName: string } }
    | null,
};

const readRoundRow = {
  id: 10,
  number: 1,
  label: 'Semifinais' as string | null,
  slots: [readSlotRow],
};

async function captureApiException(
  promise: Promise<unknown>,
): Promise<ApiException> {
  return promise.then(
    () => {
      throw new Error('Expected ApiException');
    },
    (error: unknown) => error as ApiException,
  );
}

function getApiErrorCode(error: ApiException): string {
  const response = error.getResponse();
  if (
    typeof response !== 'object' ||
    response === null ||
    !('error' in response) ||
    typeof response.error !== 'object' ||
    response.error === null ||
    !('code' in response.error) ||
    typeof response.error.code !== 'string'
  ) {
    throw new Error('Expected ApiException error response');
  }
  return response.error.code;
}

describe('TournamentBracketsService', () => {
  let service: TournamentBracketsService;

  function arrangeTournament(
    status: TournamentStatus = TournamentStatus.REGISTRATION,
    format: TournamentFormat = TournamentFormat.KNOCKOUT,
  ): void {
    mockPrisma.tournament.findFirst.mockResolvedValue({ id: 12, status, format });
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TournamentBracketsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(TournamentBracketsService);
  });

  describe('bracket read', () => {
    it('maps rounds and slots into the enriched bracket tree', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([readRoundRow]);

      await expect(service.findBracket(42, 12)).resolves.toEqual({
        rounds: [
          {
            id: 10,
            number: 1,
            label: 'Semifinais',
            slots: [
              {
                id: 101,
                position: 1,
                label: null,
                homeTeam: {
                  tournamentTeamId: 21,
                  name: 'Engenharia',
                  shortName: 'ENG',
                },
                awayTeam: null,
                match: null,
                winnerTournamentTeamId: null,
              },
            ],
          },
        ],
      });
    });

    it('maps both participants and returns the stored winner id verbatim', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([
        {
          ...readRoundRow,
          slots: [
            {
              ...readSlotRow,
              winnerTournamentTeamId: 21,
              awayTournamentTeam: {
                id: 22,
                displayNameSnapshot: 'Direito',
                team: { shortName: 'DIR' },
              },
            },
          ],
        },
      ]);

      await expect(service.findBracket(42, 12)).resolves.toEqual({
        rounds: [
          {
            id: 10,
            number: 1,
            label: 'Semifinais',
            slots: [
              {
                id: 101,
                position: 1,
                label: null,
                homeTeam: {
                  tournamentTeamId: 21,
                  name: 'Engenharia',
                  shortName: 'ENG',
                },
                awayTeam: {
                  tournamentTeamId: 22,
                  name: 'Direito',
                  shortName: 'DIR',
                },
                match: null,
                winnerTournamentTeamId: 21,
              },
            ],
          },
        ],
      });
    });

    it('keeps a round with no active slots and returns an empty slot list', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([
        { ...readRoundRow, id: 11, number: 2, label: 'Final', slots: [] },
      ]);

      await expect(service.findBracket(42, 12)).resolves.toEqual({
        rounds: [{ id: 11, number: 2, label: 'Final', slots: [] }],
      });
    });

    it('returns an empty round list when the tournament has no active rounds', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([]);

      await expect(service.findBracket(42, 12)).resolves.toEqual({ rounds: [] });
    });

    it.each([
      [TournamentFormat.LEAGUE],
      [TournamentFormat.GROUP_STAGE],
      [TournamentFormat.GROUP_STAGE_KNOCKOUT],
    ])('reads the bracket without gating the %s format', async (format) => {
      arrangeTournament(TournamentStatus.COMPLETED, format);
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([]);

      await expect(service.findBracket(42, 12)).resolves.toEqual({ rounds: [] });
    });

    it('scopes both levels to the tenant and applies the contract ordering', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findMany.mockResolvedValue([]);

      await service.findBracket(42, 12);

      expect(mockPrisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: 12, organizationId: 42, isDeleted: false },
        select: { id: true, status: true, format: true },
      });
      expect(mockPrisma.tournamentBracketRound.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 12, organizationId: 42, isDeleted: false },
        orderBy: [{ number: 'asc' }, { id: 'asc' }],
        select: bracketReadSelect,
      });
    });

    it('returns 404 before reading a missing or cross-tenant tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      const error = await captureApiException(service.findBracket(42, 999));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketRound.findMany).not.toHaveBeenCalled();
    });
  });
});
