import {
  Controller,
  Get,
  Param,
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
import { AthletesService } from './athletes.service';
import { ListAthletesQueryDto } from './dto/list-athletes-query.dto';
import {
  ListAthleteMatchesQueryDto,
  ListAthleteTournamentsQueryDto,
} from './dto/athlete-history-query.dto';
import { AthleteCatalogResponseDto } from './dto/athlete-catalog-response.dto';
import {
  AthleteMatchResponseDto,
  AthleteProfileResponseDto,
  AthleteTournamentResponseDto,
} from './dto/athlete-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { StatisticsResponseDto } from '../statistics/dto/statistics-response.dto';

@ApiTags('athletes')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('athletes')
export class AthletesController {
  constructor(private readonly athletesService: AthletesService) {}

  @Get()
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List roster-eligible users of the active JWT organization',
  })
  @ApiPaginatedOkResponse(AthleteCatalogResponseDto)
  findAll(
    @Query() query: ListAthletesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: AthleteCatalogResponseDto[] }> {
    return this.athletesService.findAll(user.organizationId as number, query);
  }

  @Get(':id/statistics')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: 'Get all-time statistics for an athlete' })
  @ApiParam({ name: 'id', example: 165, description: 'Global User.id.' })
  @ApiOkResponse({ type: StatisticsResponseDto })
  findStatistics(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<StatisticsResponseDto> {
    return this.athletesService.findStatistics(
      user.organizationId as number,
      id,
    );
  }

  @Get(':id/matches')
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List finished match statistics for an athlete' })
  @ApiParam({ name: 'id', example: 165, description: 'Global User.id.' })
  @ApiPaginatedOkResponse(AthleteMatchResponseDto)
  findMatches(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: ListAthleteMatchesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: AthleteMatchResponseDto[] }> {
    return this.athletesService.findMatches(
      user.organizationId as number,
      id,
      query,
    );
  }

  @Get(':id/tournaments')
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List tournament statistics for an athlete' })
  @ApiParam({ name: 'id', example: 165, description: 'Global User.id.' })
  @ApiPaginatedOkResponse(AthleteTournamentResponseDto)
  findTournaments(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: ListAthleteTournamentsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: AthleteTournamentResponseDto[] }> {
    return this.athletesService.findTournaments(
      user.organizationId as number,
      id,
      query,
    );
  }

  @Get(':id')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({
    summary: 'Get an athlete profile in the active organization',
  })
  @ApiParam({ name: 'id', example: 165, description: 'Global User.id.' })
  @ApiOkResponse({ type: AthleteProfileResponseDto })
  findOne(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<AthleteProfileResponseDto> {
    return this.athletesService.findOne(user.organizationId as number, id);
  }
}
