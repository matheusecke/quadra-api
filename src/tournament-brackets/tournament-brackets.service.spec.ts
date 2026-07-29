import { HttpStatus } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentBracketsService,
  bracketReadSelect,
  tournamentBracketRoundSelect,
  tournamentBracketRoundTargetSelect,
  tournamentBracketSlotSelect,
  tournamentBracketSlotTargetSelect,
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

const roundRow = {
  id: 10,
  tournamentId: 12,
  number: 1,
  label: 'Semifinais' as string | null,
  createdAt: new Date('2026-07-28T18:00:00.000Z'),
  updatedAt: new Date('2026-07-28T18:00:00.000Z'),
};

const slotRow = {
  id: 101,
  tournamentId: 12,
  roundId: 10,
  position: 1,
  label: null as string | null,
  homeTournamentTeamId: null as number | null,
  awayTournamentTeamId: null as number | null,
  matchId: null as number | null,
  winnerTournamentTeamId: null as number | null,
  createdAt: new Date('2026-07-28T18:05:00.000Z'),
  updatedAt: new Date('2026-07-28T18:05:00.000Z'),
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

  function arrangeRoundTarget(
    status: TournamentStatus = TournamentStatus.REGISTRATION,
    format: TournamentFormat = TournamentFormat.KNOCKOUT,
  ): void {
    mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce({
      ...roundRow,
      tournament: { status, format },
    });
  }

  function arrangeSlotTarget(
    overrides: Partial<typeof slotRow> = {},
    status: TournamentStatus = TournamentStatus.REGISTRATION,
    format: TournamentFormat = TournamentFormat.KNOCKOUT,
  ): void {
    mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce({
      ...slotRow,
      ...overrides,
      tournament: { status, format },
    });
  }

  function arrangeRegistration(
    overrides: {
      id?: number;
      tournamentId?: number;
      status?: TournamentTeamStatus;
    } = {},
  ): void {
    mockPrisma.tournamentTeam.findFirst.mockResolvedValueOnce({
      id: 21,
      tournamentId: 12,
      status: TournamentTeamStatus.ACTIVE,
      ...overrides,
    });
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

  describe('bracket rounds', () => {
    it('creates a round and returns the persisted row', async () => {
      arrangeTournament(TournamentStatus.REGISTRATION, TournamentFormat.KNOCKOUT);
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentBracketRound.create.mockResolvedValue(roundRow);

      await expect(
        service.createRound(42, 12, { number: 1, label: 'Semifinais' }),
      ).resolves.toEqual(roundRow);
      expect(mockPrisma.tournamentBracketRound.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          number: 1,
          label: 'Semifinais',
        },
        select: tournamentBracketRoundSelect,
      });
    });

    it('stores a null label when the key is omitted', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentBracketRound.create.mockResolvedValue({
        ...roundRow,
        number: 3,
        label: null,
      });

      await service.createRound(42, 12, { number: 3 });

      expect(mockPrisma.tournamentBracketRound.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          number: 3,
          label: null,
        },
        select: tournamentBracketRoundSelect,
      });
    });

    it.each([
      [TournamentFormat.KNOCKOUT],
      [TournamentFormat.GROUP_STAGE_KNOCKOUT],
    ])('creates a round in a %s tournament', async (format) => {
      arrangeTournament(TournamentStatus.REGISTRATION, format);
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentBracketRound.create.mockResolvedValue(roundRow);

      await expect(service.createRound(42, 12, { number: 1 })).resolves.toEqual(
        roundRow,
      );
    });

    it.each([[TournamentFormat.LEAGUE], [TournamentFormat.GROUP_STAGE]])(
      'rejects a round create in a %s tournament',
      async (format) => {
        arrangeTournament(TournamentStatus.REGISTRATION, format);

        const error = await captureApiException(
          service.createRound(42, 12, { number: 1 }),
        );

        expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
        expect(mockPrisma.tournamentBracketRound.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      [TournamentStatus.DRAFT],
      [TournamentStatus.REGISTRATION],
      [TournamentStatus.IN_PROGRESS],
    ])('creates a round while the tournament is %s', async (status) => {
      arrangeTournament(status);
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentBracketRound.create.mockResolvedValue(roundRow);

      await expect(service.createRound(42, 12, { number: 1 })).resolves.toEqual(
        roundRow,
      );
    });

    it.each([[TournamentStatus.COMPLETED], [TournamentStatus.CANCELLED]])(
      'rejects a round create while the tournament is %s',
      async (status) => {
        arrangeTournament(status);

        const error = await captureApiException(
          service.createRound(42, 12, { number: 1 }),
        );

        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
        expect(mockPrisma.tournamentBracketRound.create).not.toHaveBeenCalled();
      },
    );

    it('rejects a number already held by an active round of the tournament', async () => {
      arrangeTournament();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValue({ id: 99 });

      const error = await captureApiException(
        service.createRound(42, 12, { number: 1 }),
      );

      expect(getApiErrorCode(error)).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentBracketRound.findFirst).toHaveBeenCalledWith({
        where: {
          tournamentId: 12,
          organizationId: 42,
          number: 1,
          isDeleted: false,
        },
        select: { id: true },
      });
      expect(mockPrisma.tournamentBracketRound.create).not.toHaveBeenCalled();
    });

    it('returns 404 before creating a round in a missing or cross-tenant tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      const error = await captureApiException(
        service.createRound(42, 999, { number: 1 }),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketRound.create).not.toHaveBeenCalled();
    });

    it('updates the number and the label and returns the updated row', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);
      const updated = { ...roundRow, number: 2, label: 'Quartas de final' };
      mockPrisma.tournamentBracketRound.update.mockResolvedValue(updated);

      await expect(
        service.updateRound(42, 10, { number: 2, label: 'Quartas de final' }),
      ).resolves.toEqual(updated);
      expect(mockPrisma.tournamentBracketRound.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { number: 2, label: 'Quartas de final' },
        select: tournamentBracketRoundSelect,
      });
    });

    it('scopes the round lookup to the tenant and to live rows', async () => {
      arrangeRoundTarget();

      await service.updateRound(42, 10, {});

      expect(mockPrisma.tournamentBracketRound.findFirst).toHaveBeenCalledWith({
        where: {
          id: 10,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: tournamentBracketRoundTargetSelect,
      });
    });

    it('clears the label when the body sends null', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketRound.update.mockResolvedValue({
        ...roundRow,
        label: null,
      });

      await service.updateRound(42, 10, { label: null });

      expect(mockPrisma.tournamentBracketRound.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { label: null },
        select: tournamentBracketRoundSelect,
      });
    });

    it('writes only the number when the label key is omitted', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketRound.update.mockResolvedValue({
        ...roundRow,
        number: 4,
      });

      await service.updateRound(42, 10, { number: 4 });

      expect(mockPrisma.tournamentBracketRound.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { number: 4 },
        select: tournamentBracketRoundSelect,
      });
    });

    it('returns the current row without writing for an empty patch body', async () => {
      arrangeRoundTarget();

      await expect(service.updateRound(42, 10, {})).resolves.toEqual(roundRow);
      expect(mockPrisma.tournamentBracketRound.update).not.toHaveBeenCalled();
    });

    it('treats the round own current number as a no-op instead of a conflict', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketRound.update.mockResolvedValue(roundRow);

      await expect(service.updateRound(42, 10, { number: 1 })).resolves.toEqual(
        roundRow,
      );
      expect(mockPrisma.tournamentBracketRound.findFirst).toHaveBeenLastCalledWith({
        where: {
          tournamentId: 12,
          organizationId: 42,
          number: 1,
          isDeleted: false,
          id: { not: 10 },
        },
        select: { id: true },
      });
    });

    it('rejects a number held by another active round', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce({ id: 99 });

      const error = await captureApiException(
        service.updateRound(42, 10, { number: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentBracketRound.update).not.toHaveBeenCalled();
    });

    it('rejects a round update in a format without a knockout stage', async () => {
      arrangeRoundTarget(TournamentStatus.REGISTRATION, TournamentFormat.LEAGUE);

      const error = await captureApiException(
        service.updateRound(42, 10, { number: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
    });

    it('rejects a round update in a terminal tournament', async () => {
      arrangeRoundTarget(TournamentStatus.COMPLETED);

      const error = await captureApiException(
        service.updateRound(42, 10, { number: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    });

    it('returns 404 for a missing, deleted, or cross-tenant round', async () => {
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(
        service.updateRound(42, 999, { number: 2 }),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketRound.update).not.toHaveBeenCalled();
    });

    it('soft-deletes an empty round', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentBracketRound.update.mockResolvedValue(roundRow);

      await expect(service.removeRound(42, 10)).resolves.toBeUndefined();
      expect(mockPrisma.tournamentBracketSlot.findFirst).toHaveBeenCalledWith({
        where: { roundId: 10, organizationId: 42, isDeleted: false },
        select: { id: true },
      });
      expect(mockPrisma.tournamentBracketRound.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { isDeleted: true },
      });
    });

    it('rejects deleting a round that still has an active slot', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue({ id: 101 });

      const error = await captureApiException(service.removeRound(42, 10));

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(getApiErrorCode(error)).toBe('ROUND_NOT_EMPTY');
      expect(mockPrisma.tournamentBracketRound.update).not.toHaveBeenCalled();
    });

    it('rejects a round delete in a terminal tournament', async () => {
      arrangeRoundTarget(TournamentStatus.CANCELLED);

      const error = await captureApiException(service.removeRound(42, 10));

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    });

    it('rejects a round delete in a format without a knockout stage', async () => {
      arrangeRoundTarget(
        TournamentStatus.REGISTRATION,
        TournamentFormat.GROUP_STAGE,
      );

      const error = await captureApiException(service.removeRound(42, 10));

      expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
    });

    it('returns 404 when deleting a missing, deleted, or cross-tenant round', async () => {
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(service.removeRound(42, 999));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketRound.update).not.toHaveBeenCalled();
    });
  });

  describe('bracket slots', () => {
    it('creates a slot from its round and returns the persisted row', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 21 });
      arrangeRegistration({ id: 22 });
      const created = {
        ...slotRow,
        homeTournamentTeamId: 21,
        awayTournamentTeamId: 22,
      };
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue(created);

      await expect(
        service.createSlot(42, {
          roundId: 10,
          position: 1,
          homeTournamentTeamId: 21,
          awayTournamentTeamId: 22,
        }),
      ).resolves.toEqual(created);
      expect(mockPrisma.tournamentBracketSlot.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          roundId: 10,
          position: 1,
          label: null,
          homeTournamentTeamId: 21,
          awayTournamentTeamId: 22,
        },
        select: tournamentBracketSlotSelect,
      });
    });

    it('creates an empty slot when both participants are omitted', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue({
        ...slotRow,
        label: 'Final',
      });

      await service.createSlot(42, { roundId: 10, position: 1, label: 'Final' });

      expect(mockPrisma.tournamentTeam.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentBracketSlot.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          roundId: 10,
          position: 1,
          label: 'Final',
          homeTournamentTeamId: null,
          awayTournamentTeamId: null,
        },
        select: tournamentBracketSlotSelect,
      });
    });

    it('creates a bye slot with only a home participant', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 23 });
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue({
        ...slotRow,
        id: 102,
        position: 2,
        homeTournamentTeamId: 23,
      });

      await service.createSlot(42, {
        roundId: 10,
        position: 2,
        homeTournamentTeamId: 23,
      });

      expect(mockPrisma.tournamentBracketSlot.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          roundId: 10,
          position: 2,
          label: null,
          homeTournamentTeamId: 23,
          awayTournamentTeamId: null,
        },
        select: tournamentBracketSlotSelect,
      });
    });

    it('rejects a position already held by an active slot of the same round', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce({ id: 199 });

      const error = await captureApiException(
        service.createSlot(42, { roundId: 10, position: 1 }),
      );

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(getApiErrorCode(error)).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentBracketSlot.findFirst).toHaveBeenLastCalledWith({
        where: {
          roundId: 10,
          organizationId: 42,
          position: 1,
          isDeleted: false,
        },
        select: { id: true },
      });
      expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
    });

    it('accepts the same position in a different round', async () => {
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce({
        ...roundRow,
        id: 11,
        number: 2,
        tournament: {
          status: TournamentStatus.REGISTRATION,
          format: TournamentFormat.KNOCKOUT,
        },
      });
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue({
        ...slotRow,
        id: 103,
        roundId: 11,
      });

      await expect(
        service.createSlot(42, { roundId: 11, position: 1 }),
      ).resolves.toEqual({ ...slotRow, id: 103, roundId: 11 });
    });

    it('returns 404 before creating a slot in a missing or cross-tenant round', async () => {
      mockPrisma.tournamentBracketRound.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(
        service.createSlot(42, { roundId: 999, position: 1 }),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
    });

    it.each([[TournamentFormat.LEAGUE], [TournamentFormat.GROUP_STAGE]])(
      'rejects a slot create in a %s tournament',
      async (format) => {
        arrangeRoundTarget(TournamentStatus.REGISTRATION, format);

        const error = await captureApiException(
          service.createSlot(42, { roundId: 10, position: 1 }),
        );

        expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
        expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      [TournamentStatus.DRAFT],
      [TournamentStatus.REGISTRATION],
      [TournamentStatus.IN_PROGRESS],
    ])('creates a slot while the tournament is %s', async (status) => {
      arrangeRoundTarget(status);
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue(slotRow);

      await expect(
        service.createSlot(42, { roundId: 10, position: 1 }),
      ).resolves.toEqual(slotRow);
    });

    it.each([[TournamentStatus.COMPLETED], [TournamentStatus.CANCELLED]])(
      'rejects a slot create while the tournament is %s',
      async (status) => {
        arrangeRoundTarget(status);

        const error = await captureApiException(
          service.createSlot(42, { roundId: 10, position: 1 }),
        );

        expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
        expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for a participant that is missing or from another organization', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentTeam.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(
        service.createSlot(42, {
          roundId: 10,
          position: 1,
          homeTournamentTeamId: 777,
        }),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentTeam.findFirst).toHaveBeenCalledWith({
        where: { id: 777, organizationId: 42, isDeleted: false },
        select: { id: true, tournamentId: true, status: true },
      });
      expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
    });

    it('rejects a withdrawn participant', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 21, status: TournamentTeamStatus.WITHDRAWN });

      const error = await captureApiException(
        service.createSlot(42, {
          roundId: 10,
          position: 1,
          homeTournamentTeamId: 21,
        }),
      );

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(getApiErrorCode(error)).toBe('INACTIVE_REGISTRATION');
    });

    it('rejects a participant registered in another tournament', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 21, tournamentId: 99 });

      const error = await captureApiException(
        service.createSlot(42, {
          roundId: 10,
          position: 1,
          homeTournamentTeamId: 21,
        }),
      );

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(getApiErrorCode(error)).toBe('INVALID_BRACKET_ASSIGNMENT');
    });

    it('rejects the same registration on both sides of a slot', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 21 });
      arrangeRegistration({ id: 21 });

      const error = await captureApiException(
        service.createSlot(42, {
          roundId: 10,
          position: 1,
          homeTournamentTeamId: 21,
          awayTournamentTeamId: 21,
        }),
      );

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(getApiErrorCode(error)).toBe('SAME_TEAM_IN_SLOT');
      expect(mockPrisma.tournamentBracketSlot.create).not.toHaveBeenCalled();
    });

    it('accepts a registration that already occupies another slot', async () => {
      arrangeRoundTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      arrangeRegistration({ id: 21 });
      mockPrisma.tournamentBracketSlot.create.mockResolvedValue({
        ...slotRow,
        id: 104,
        position: 3,
        homeTournamentTeamId: 21,
      });

      await expect(
        service.createSlot(42, {
          roundId: 10,
          position: 3,
          homeTournamentTeamId: 21,
        }),
      ).resolves.toEqual({
        ...slotRow,
        id: 104,
        position: 3,
        homeTournamentTeamId: 21,
      });
    });

    it('scopes the slot lookup to the tenant and to live rows', async () => {
      arrangeSlotTarget();

      await service.updateSlot(42, 101, {});

      expect(mockPrisma.tournamentBracketSlot.findFirst).toHaveBeenCalledWith({
        where: {
          id: 101,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: tournamentBracketSlotTargetSelect,
      });
    });

    it('sets the away participant on a slot that only had a home participant', async () => {
      arrangeSlotTarget({ homeTournamentTeamId: 23 });
      arrangeRegistration({ id: 24 });
      const updated = {
        ...slotRow,
        homeTournamentTeamId: 23,
        awayTournamentTeamId: 24,
      };
      mockPrisma.tournamentBracketSlot.update.mockResolvedValue(updated);

      await expect(
        service.updateSlot(42, 101, { awayTournamentTeamId: 24 }),
      ).resolves.toEqual(updated);
      expect(mockPrisma.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { awayTournamentTeamId: 24 },
        select: tournamentBracketSlotSelect,
      });
    });

    it('clears both participants when the body sends null and looks up neither', async () => {
      arrangeSlotTarget({ homeTournamentTeamId: 23, awayTournamentTeamId: 24 });
      mockPrisma.tournamentBracketSlot.update.mockResolvedValue(slotRow);

      await service.updateSlot(42, 101, {
        homeTournamentTeamId: null,
        awayTournamentTeamId: null,
      });

      expect(mockPrisma.tournamentTeam.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { homeTournamentTeamId: null, awayTournamentTeamId: null },
        select: tournamentBracketSlotSelect,
      });
    });

    it('writes only position and label when the participant keys are omitted', async () => {
      arrangeSlotTarget({ homeTournamentTeamId: 23 });
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketSlot.update.mockResolvedValue({
        ...slotRow,
        position: 4,
        label: 'Disputa de 3º lugar',
        homeTournamentTeamId: 23,
      });

      await service.updateSlot(42, 101, {
        position: 4,
        label: 'Disputa de 3º lugar',
      });

      expect(mockPrisma.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { position: 4, label: 'Disputa de 3º lugar' },
        select: tournamentBracketSlotSelect,
      });
    });

    it('returns the current row without writing for an empty patch body', async () => {
      arrangeSlotTarget();

      await expect(service.updateSlot(42, 101, {})).resolves.toEqual(slotRow);
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('treats the slot own current position as a no-op instead of a conflict', async () => {
      arrangeSlotTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);
      mockPrisma.tournamentBracketSlot.update.mockResolvedValue(slotRow);

      await expect(
        service.updateSlot(42, 101, { position: 1 }),
      ).resolves.toEqual(slotRow);
      expect(mockPrisma.tournamentBracketSlot.findFirst).toHaveBeenLastCalledWith({
        where: {
          roundId: 10,
          organizationId: 42,
          position: 1,
          isDeleted: false,
          id: { not: 101 },
        },
        select: { id: true },
      });
    });

    it('rejects a position held by another active slot of the round', async () => {
      arrangeSlotTarget();
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce({ id: 199 });

      const error = await captureApiException(
        service.updateSlot(42, 101, { position: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('rejects an away participant equal to the stored home participant', async () => {
      arrangeSlotTarget({ homeTournamentTeamId: 23 });
      arrangeRegistration({ id: 23 });

      const error = await captureApiException(
        service.updateSlot(42, 101, { awayTournamentTeamId: 23 }),
      );

      expect(getApiErrorCode(error)).toBe('SAME_TEAM_IN_SLOT');
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('rejects a home participant equal to the stored away participant', async () => {
      arrangeSlotTarget({ awayTournamentTeamId: 24 });
      arrangeRegistration({ id: 24 });

      const error = await captureApiException(
        service.updateSlot(42, 101, { homeTournamentTeamId: 24 }),
      );

      expect(getApiErrorCode(error)).toBe('SAME_TEAM_IN_SLOT');
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('rejects a slot update in a format without a knockout stage', async () => {
      arrangeSlotTarget({}, TournamentStatus.REGISTRATION, TournamentFormat.LEAGUE);

      const error = await captureApiException(
        service.updateSlot(42, 101, { position: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
    });

    it('rejects a slot update in a terminal tournament', async () => {
      arrangeSlotTarget({}, TournamentStatus.COMPLETED);

      const error = await captureApiException(
        service.updateSlot(42, 101, { position: 2 }),
      );

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    });

    it('returns 404 for a missing, deleted, or cross-tenant slot', async () => {
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(
        service.updateSlot(42, 999, { position: 2 }),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('soft-deletes an unlinked slot', async () => {
      arrangeSlotTarget();
      mockPrisma.tournamentBracketSlot.update.mockResolvedValue(slotRow);

      await expect(service.removeSlot(42, 101)).resolves.toBeUndefined();
      expect(mockPrisma.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: { isDeleted: true },
      });
    });

    it('rejects deleting a slot that still has a linked match', async () => {
      arrangeSlotTarget({ matchId: 501 });

      const error = await captureApiException(service.removeSlot(42, 101));

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(getApiErrorCode(error)).toBe('SLOT_HAS_MATCH');
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });

    it('rejects a slot delete in a terminal tournament', async () => {
      arrangeSlotTarget({}, TournamentStatus.CANCELLED);

      const error = await captureApiException(service.removeSlot(42, 101));

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    });

    it('rejects a slot delete in a format without a knockout stage', async () => {
      arrangeSlotTarget(
        {},
        TournamentStatus.REGISTRATION,
        TournamentFormat.GROUP_STAGE,
      );

      const error = await captureApiException(service.removeSlot(42, 101));

      expect(getApiErrorCode(error)).toBe('INVALID_TOURNAMENT_FORMAT');
    });

    it('returns 404 when deleting a missing, deleted, or cross-tenant slot', async () => {
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValueOnce(null);

      const error = await captureApiException(service.removeSlot(42, 999));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
    });
  });
});
