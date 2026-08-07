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
import { TournamentGroupsService } from './tournament-groups.service';
import { CreateTournamentGroupDto } from './dto/create-tournament-group.dto';
import { CreateTournamentGroupTeamDto } from './dto/create-tournament-group-team.dto';
import { ListTournamentGroupsQueryDto } from './dto/list-tournament-groups-query.dto';
import { ListTournamentGroupTeamsQueryDto } from './dto/list-tournament-group-teams-query.dto';
import { TournamentGroupResponseDto } from './dto/tournament-group-response.dto';
import { TournamentGroupTeamResponseDto } from './dto/tournament-group-team-response.dto';
import { UpdateTournamentGroupDto } from './dto/update-tournament-group.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournament-groups')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class TournamentGroupsByTournamentController {
  constructor(
    private readonly tournamentGroupsService: TournamentGroupsService,
  ) {}

  @Get(':id/groups')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: "List a tournament's groups" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentGroupResponseDto, isArray: true })
  findGroups(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: ListTournamentGroupsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentGroupResponseDto[]> {
    return this.tournamentGroupsService.findGroups(
      user.organizationId as number,
      id,
    );
  }

  @Post(':id/groups')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a group in a tournament' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiCreatedResponse({ type: TournamentGroupResponseDto })
  createGroup(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: CreateTournamentGroupDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentGroupResponseDto> {
    return this.tournamentGroupsService.createGroup(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Get(':id/group-teams')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: "List a tournament's group memberships" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentGroupTeamResponseDto, isArray: true })
  findGroupTeams(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: ListTournamentGroupTeamsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentGroupTeamResponseDto[]> {
    return this.tournamentGroupsService.findGroupTeams(
      user.organizationId as number,
      id,
    );
  }
}

@ApiTags('tournament-groups')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-groups')
export class TournamentGroupsController {
  constructor(
    private readonly tournamentGroupsService: TournamentGroupsService,
  ) {}

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Rename a tournament group' })
  @ApiParam({ name: 'id', example: 7, description: 'TournamentGroup id.' })
  @ApiOkResponse({ type: TournamentGroupResponseDto })
  updateGroup(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentGroupDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentGroupResponseDto> {
    return this.tournamentGroupsService.updateGroup(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an empty tournament group' })
  @ApiParam({ name: 'id', example: 7, description: 'TournamentGroup id.' })
  async removeGroup(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentGroupsService.removeGroup(
      user.organizationId as number,
      id,
    );
  }
}

@ApiTags('tournament-groups')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-group-teams')
export class TournamentGroupTeamsController {
  constructor(
    private readonly tournamentGroupsService: TournamentGroupsService,
  ) {}

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a tournament team registration to a group' })
  @ApiCreatedResponse({ type: TournamentGroupTeamResponseDto })
  assignTeam(
    @Body() dto: CreateTournamentGroupTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentGroupTeamResponseDto> {
    return this.tournamentGroupsService.assignTeam(
      user.organizationId as number,
      dto,
    );
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a tournament group membership' })
  @ApiParam({
    name: 'id',
    example: 31,
    description: 'TournamentGroupTeam id.',
  })
  async removeTeam(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentGroupsService.removeTeam(
      user.organizationId as number,
      id,
    );
  }
}
