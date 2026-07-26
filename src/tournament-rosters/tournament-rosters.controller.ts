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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { TournamentRostersService } from './tournament-rosters.service';
import { CreateTournamentRosterDto } from './dto/create-tournament-roster.dto';
import { UpdateTournamentRosterDto } from './dto/update-tournament-roster.dto';
import { ListTournamentRostersQueryDto } from './dto/list-tournament-rosters-query.dto';
import { TournamentRosterResponseDto } from './dto/tournament-roster-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournament-rosters')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-teams')
export class TournamentRostersByTeamController {
  constructor(
    private readonly tournamentRostersService: TournamentRostersService,
  ) {}

  @Get(':id/tournament-rosters')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: "List a tournament team's active roster" })
  @ApiParam({ name: 'id', example: 41, description: 'TournamentTeam id.' })
  @ApiOkResponse({ type: TournamentRosterResponseDto, isArray: true })
  findAll(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() _query: ListTournamentRostersQueryDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<TournamentRosterResponseDto[]> {
    return this.tournamentRostersService.findAll(
      actor.organizationId as number,
      id,
    );
  }
}

@ApiTags('tournament-rosters')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-rosters')
export class TournamentRostersController {
  constructor(
    private readonly tournamentRostersService: TournamentRostersService,
  ) {}

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN, OrgRole.COACHING_STAFF)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Add a member to a tournament roster, or reactivate an inactive entry',
  })
  @ApiOkResponse({ type: TournamentRosterResponseDto })
  create(
    @Body() dto: CreateTournamentRosterDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<TournamentRosterResponseDto> {
    return this.tournamentRostersService.create(actor, dto);
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN, OrgRole.COACHING_STAFF)
  @ApiOperation({
    summary: 'Update the jersey number or role of a roster entry',
  })
  @ApiParam({ name: 'id', example: 88, description: 'TournamentRoster id.' })
  @ApiOkResponse({ type: TournamentRosterResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentRosterDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<TournamentRosterResponseDto> {
    return this.tournamentRostersService.update(actor, id, dto);
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN, OrgRole.COACHING_STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a roster entry' })
  @ApiParam({ name: 'id', example: 88, description: 'TournamentRoster id.' })
  async remove(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() actor: JwtPayload,
  ): Promise<void> {
    await this.tournamentRostersService.remove(actor, id);
  }
}
