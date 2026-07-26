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
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { CompleteTournamentDto } from './dto/complete-tournament.dto';
import { ListTournamentsQueryDto } from './dto/list-tournaments-query.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';
import { ChampionSuggestionResponseDto } from './dto/champion-suggestion-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournaments')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List tournaments of the active JWT organization' })
  @ApiPaginatedOkResponse(TournamentResponseDto)
  findAll(
    @Query() query: ListTournamentsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TournamentResponseDto[] }> {
    return this.tournamentsService.findAll(
      user.organizationId as number,
      query,
    );
  }

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tournament (org admin)' })
  @ApiCreatedResponse({ type: TournamentResponseDto })
  create(
    @Body() dto: CreateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.create(
      user.organizationId as number,
      user.sub,
      dto,
    );
  }

  @Get(':id')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: 'Get a tournament by id' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentResponseDto })
  findOne(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.findOne(user.organizationId as number, id);
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Update a tournament (org admin)' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.update(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Post(':id/complete')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a tournament and declare its champion (org admin)',
  })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentResponseDto })
  complete(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: CompleteTournamentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.complete(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Post(':id/reopen')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a completed tournament (org admin)' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: TournamentResponseDto })
  reopen(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentResponseDto> {
    return this.tournamentsService.reopen(user.organizationId as number, id);
  }

  @Get(':id/champion-suggestion')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: 'Suggest a champion from the tournament structure' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: ChampionSuggestionResponseDto })
  championSuggestion(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChampionSuggestionResponseDto> {
    return this.tournamentsService.championSuggestion(
      user.organizationId as number,
      id,
    );
  }
}
