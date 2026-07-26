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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { TournamentTeamsService } from './tournament-teams.service';
import { CreateTournamentTeamDto } from './dto/create-tournament-team.dto';
import { UpdateTournamentTeamDto } from './dto/update-tournament-team.dto';
import { ListTournamentTeamsQueryDto } from './dto/list-tournament-teams-query.dto';
import { TournamentTeamResponseDto } from './dto/tournament-team-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournament-teams')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class TournamentTeamsByTournamentController {
  constructor(
    private readonly tournamentTeamsService: TournamentTeamsService,
  ) {}

  @Get(':id/teams')
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: "List a tournament's team registrations" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiPaginatedOkResponse(TournamentTeamResponseDto)
  findAll(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: ListTournamentTeamsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TournamentTeamResponseDto[] }> {
    return this.tournamentTeamsService.findAll(
      user.organizationId as number,
      id,
      query,
    );
  }

  @Post(':id/teams')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register a team in the tournament, or reactivate a withdrawn registration',
  })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentTeamResponseDto })
  create(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: CreateTournamentTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentTeamResponseDto> {
    return this.tournamentTeamsService.create(
      user.organizationId as number,
      id,
      dto,
    );
  }
}

@ApiTags('tournament-teams')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-teams')
export class TournamentTeamsController {
  constructor(
    private readonly tournamentTeamsService: TournamentTeamsService,
  ) {}

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Update the seed of a tournament team registration',
  })
  @ApiParam({ name: 'id', example: 41, description: 'TournamentTeam id.' })
  @ApiOkResponse({ type: TournamentTeamResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentTeamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentTeamResponseDto> {
    return this.tournamentTeamsService.update(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Delete(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw a team registration' })
  @ApiParam({ name: 'id', example: 41, description: 'TournamentTeam id.' })
  async remove(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tournamentTeamsService.remove(user.organizationId as number, id);
  }
}
