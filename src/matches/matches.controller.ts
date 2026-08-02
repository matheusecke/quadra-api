import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { CreateMatchDto } from './dto/create-match.dto';
import {
  ListMatchesQueryDto,
  ListTournamentMatchesQueryDto,
} from './dto/list-matches-query.dto';
import { MatchActionDto } from './dto/match-action.dto';
import {
  MatchDetailResponseDto,
  MatchSummaryResponseDto,
} from './dto/match-response.dto';
import {
  SaveMatchDraftDto,
  SubmitMatchResultDto,
} from './dto/match-scoresheet.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchesService } from './matches.service';

@ApiTags('matches')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List organization matches' })
  @ApiPaginatedOkResponse(MatchSummaryResponseDto)
  findAll(
    @Query() query: ListMatchesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    return this.matchesService.findAll(user.organizationId as number, query);
  }

  @Get(':id')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: 'Read match details' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  findOne(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.findOne(user.organizationId as number, id);
  }

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a match' })
  @ApiCreatedResponse({ type: MatchDetailResponseDto })
  create(
    @Query() _query: MatchActionDto,
    @Body() dto: CreateMatchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.create(
      user.organizationId as number,
      user.sub,
      dto,
    );
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Edit match scheduling data' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() dto: UpdateMatchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.update(user.organizationId as number, id, dto);
  }

  @Post(':id/draft')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a match scoresheet draft' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  draft(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() dto: SaveMatchDraftDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.draft(user.organizationId as number, id, dto);
  }

  @Post(':id/result')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a match result' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  submitResult(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() dto: SubmitMatchResultDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.submitResult(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Post(':id/reopen')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a finished match for correction' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  reopen(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() _body: MatchActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.reopen(user.organizationId as number, id);
  }

  @Post(':id/postpone')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Postpone a scheduled or live match' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  postpone(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() _body: MatchActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.postpone(user.organizationId as number, id);
  }

  @Post(':id/cancel')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled, live, or postponed match' })
  @ApiParam({ name: 'id', example: 501, description: 'Match id.' })
  @ApiOkResponse({ type: MatchDetailResponseDto })
  cancel(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: MatchActionDto,
    @Body() _body: MatchActionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MatchDetailResponseDto> {
    return this.matchesService.cancel(user.organizationId as number, id);
  }
}

@ApiTags('matches')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class MatchesByTournamentController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id/matches')
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: "List a tournament's matches" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiPaginatedOkResponse(MatchSummaryResponseDto)
  findAll(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: ListTournamentMatchesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    return this.matchesService.findAllByTournament(
      user.organizationId as number,
      id,
      query,
    );
  }
}
