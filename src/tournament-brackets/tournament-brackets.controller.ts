import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { TournamentBracketsService } from './tournament-brackets.service';
import { BracketResponseDto } from './dto/bracket-response.dto';
import { BracketSlotActionQueryDto } from './dto/bracket-slot-action-query.dto';
import { CreateTournamentBracketRoundDto } from './dto/create-tournament-bracket-round.dto';
import { CreateTournamentBracketSlotDto } from './dto/create-tournament-bracket-slot.dto';
import { GetBracketQueryDto } from './dto/get-bracket-query.dto';
import { LinkBracketSlotMatchDto } from './dto/link-bracket-slot-match.dto';
import { SetBracketSlotWinnerDto } from './dto/set-bracket-slot-winner.dto';
import { TournamentBracketRoundResponseDto } from './dto/tournament-bracket-round-response.dto';
import { TournamentBracketSlotResponseDto } from './dto/tournament-bracket-slot-response.dto';
import { UnlinkBracketSlotMatchDto } from './dto/unlink-bracket-slot-match.dto';
import { UpdateTournamentBracketRoundDto } from './dto/update-tournament-bracket-round.dto';
import { UpdateTournamentBracketSlotDto } from './dto/update-tournament-bracket-slot.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournament-brackets')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class TournamentBracketByTournamentController {
  constructor(
    private readonly tournamentBracketsService: TournamentBracketsService,
  ) {}

  @Get(':id/bracket')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: "Read a tournament's knockout bracket" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: BracketResponseDto })
  findBracket(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: GetBracketQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BracketResponseDto> {
    return this.tournamentBracketsService.findBracket(
      user.organizationId as number,
      id,
    );
  }

  @Post(':id/bracket-rounds')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a bracket round in a tournament' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiCreatedResponse({ type: TournamentBracketRoundResponseDto })
  createRound(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: CreateTournamentBracketRoundDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketRoundResponseDto> {
    return this.tournamentBracketsService.createRound(
      user.organizationId as number,
      id,
      dto,
    );
  }
}

@ApiTags('tournament-brackets')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-bracket-rounds')
export class TournamentBracketRoundsController {
  constructor(
    private readonly tournamentBracketsService: TournamentBracketsService,
  ) {}

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Edit a bracket round number or label' })
  @ApiParam({
    name: 'id',
    example: 10,
    description: 'TournamentBracketRound id.',
  })
  @ApiOkResponse({ type: TournamentBracketRoundResponseDto })
  updateRound(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentBracketRoundDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketRoundResponseDto> {
    return this.tournamentBracketsService.updateRound(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an empty bracket round' })
  @ApiParam({
    name: 'id',
    example: 10,
    description: 'TournamentBracketRound id.',
  })
  async removeRound(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentBracketsService.removeRound(
      user.organizationId as number,
      id,
    );
  }
}

@ApiTags('tournament-brackets')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-bracket-slots')
export class TournamentBracketSlotsController {
  constructor(
    private readonly tournamentBracketsService: TournamentBracketsService,
  ) {}

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a slot in a bracket round' })
  @ApiCreatedResponse({ type: TournamentBracketSlotResponseDto })
  createSlot(
    @Body() dto: CreateTournamentBracketSlotDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketSlotResponseDto> {
    return this.tournamentBracketsService.createSlot(
      user.organizationId as number,
      dto,
    );
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Edit a bracket slot position, label, or participants',
  })
  @ApiParam({
    name: 'id',
    example: 101,
    description: 'TournamentBracketSlot id.',
  })
  @ApiOkResponse({ type: TournamentBracketSlotResponseDto })
  updateSlot(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentBracketSlotDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketSlotResponseDto> {
    return this.tournamentBracketsService.updateSlot(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an unlinked bracket slot' })
  @ApiParam({
    name: 'id',
    example: 101,
    description: 'TournamentBracketSlot id.',
  })
  async removeSlot(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentBracketsService.removeSlot(
      user.organizationId as number,
      id,
    );
  }

  @Post(':id/link-match')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an existing match to a bracket slot' })
  @ApiParam({
    name: 'id',
    example: 101,
    description: 'TournamentBracketSlot id.',
  })
  @ApiOkResponse({ type: TournamentBracketSlotResponseDto })
  linkMatch(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: BracketSlotActionQueryDto,
    @Body() dto: LinkBracketSlotMatchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketSlotResponseDto> {
    return this.tournamentBracketsService.linkMatch(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Delete(':id/link-match')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Unlink the match from a bracket slot, cancelling it when it has not happened yet',
  })
  @ApiParam({
    name: 'id',
    example: 101,
    description: 'TournamentBracketSlot id.',
  })
  async unlinkMatch(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: BracketSlotActionQueryDto,
    @Body() _body: UnlinkBracketSlotMatchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentBracketsService.unlinkMatch(
      user.organizationId as number,
      id,
    );
  }

  @Put(':id/winner')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary:
      'Declare or clear the bracket slot winner, reopening a completed tournament',
  })
  @ApiParam({
    name: 'id',
    example: 101,
    description: 'TournamentBracketSlot id.',
  })
  @ApiOkResponse({ type: TournamentBracketSlotResponseDto })
  setWinner(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: BracketSlotActionQueryDto,
    @Body() dto: SetBracketSlotWinnerDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentBracketSlotResponseDto> {
    return this.tournamentBracketsService.setWinner(
      user.organizationId as number,
      id,
      dto,
    );
  }
}
