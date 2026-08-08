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
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamStatusDto } from './dto/update-team-status.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { ListTeamAffiliationCandidatesQueryDto } from './dto/list-team-affiliation-candidates-query.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { TeamAffiliationCandidateResponseDto } from './dto/team-affiliation-candidate-response.dto';
import {
  TeamMatchResponseDto,
  TeamSummaryResponseDto,
  TeamTournamentResponseDto,
} from './dto/team-profile-response.dto';
import {
  TeamMatchesQueryDto,
  TeamTournamentsQueryDto,
} from './dto/team-profile-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('teams')
@Controller('teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiStandardCrudErrors()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a team (system admin only)' })
  @ApiCreatedResponse({ type: TeamResponseDto })
  create(@Body() dto: CreateTeamDto): Promise<TeamResponseDto> {
    return this.teamsService.create(dto);
  }

  @Get()
  @UseGuards(OrgRoleGuard)
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List teams of the active JWT organization' })
  @ApiPaginatedOkResponse(TeamResponseDto)
  findAll(
    @Query() query: ListTeamsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TeamResponseDto[] }> {
    return this.teamsService.findAll(user.organizationId as number, query);
  }

  @Get('affiliation-candidates')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List candidate teams for organization affiliation',
  })
  @ApiPaginatedOkResponse(TeamAffiliationCandidateResponseDto)
  findAffiliationCandidates(
    @Query() query: ListTeamAffiliationCandidatesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TeamAffiliationCandidateResponseDto[] }> {
    return this.teamsService.findAffiliationCandidates(
      user.organizationId as number,
      query,
    );
  }

  @Get(':id/tournaments')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List team tournaments in the active organization' })
  @ApiParam({ name: 'id', example: 8, description: 'Global Team.id.' })
  @ApiPaginatedOkResponse(TeamTournamentResponseDto)
  findTournaments(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: TeamTournamentsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TeamTournamentResponseDto[] }> {
    return this.teamsService.findTournaments(
      user.organizationId as number,
      id,
      query,
    );
  }

  @Get(':id/matches')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List team matches in the active organization' })
  @ApiParam({ name: 'id', example: 8, description: 'Global Team.id.' })
  @ApiPaginatedOkResponse(TeamMatchResponseDto)
  findMatches(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: TeamMatchesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TeamMatchResponseDto[] }> {
    return this.teamsService.findMatches(
      user.organizationId as number,
      id,
      query,
    );
  }

  @Get(':id/summary')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(...ANY_ORG_ROLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a team profile summary in the active organization',
  })
  @ApiParam({ name: 'id', example: 8, description: 'Global Team.id.' })
  @ApiOkResponse({ type: TeamSummaryResponseDto })
  findSummary(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamSummaryResponseDto> {
    return this.teamsService.findSummary(user.organizationId as number, id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiParam({ name: 'id', example: 1, description: 'Team id.' })
  @ApiOkResponse({ type: TeamResponseDto })
  findById(@Param('id', ParseIntApiPipe) id: number): Promise<TeamResponseDto> {
    return this.teamsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.TEAM_ADMIN)
  @ApiOperation({
    summary: 'Update global identity of the active administrator own team',
  })
  @ApiParam({ name: 'id', example: 1, description: 'Team id.' })
  @ApiOkResponse({ type: TeamResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamResponseDto> {
    return this.teamsService.updateForTeamAdmin(
      user.organizationId as number,
      user.sub,
      id,
      dto,
    );
  }

  @Patch(':id/status')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update team status (system admin only)' })
  @ApiParam({ name: 'id', example: 1, description: 'Team id.' })
  @ApiOkResponse({ type: TeamResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTeamStatusDto,
  ): Promise<TeamResponseDto> {
    return this.teamsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a team (system admin only)' })
  @ApiParam({ name: 'id', example: 1, description: 'Team id.' })
  @ApiNoContentResponse()
  async softDelete(@Param('id', ParseIntApiPipe) id: number): Promise<void> {
    await this.teamsService.softDelete(id);
  }
}
