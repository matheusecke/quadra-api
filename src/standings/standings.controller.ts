import {
  Body,
  Controller,
  Get,
  Param,
  Put,
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
import { StandingsService } from './standings.service';
import { ListStandingsQueryDto } from './dto/list-standings-query.dto';
import { SetTiebreaksDto } from './dto/set-tiebreaks.dto';
import { StandingsTableResponseDto } from './dto/standings-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('standings')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournaments')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get(':id/standings')
  @OrgRoles(...ANY_ORG_ROLE)
  @ApiOperation({ summary: "List a tournament's classification tables" })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: StandingsTableResponseDto, isArray: true })
  findStandings(
    @Param('id', ParseIntApiPipe) id: number,
    @Query() query: ListStandingsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StandingsTableResponseDto[]> {
    return this.standingsService.findStandings(
      user.organizationId as number,
      id,
      query.groupId,
    );
  }

  @Put(':id/tiebreaks')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Record or correct the draw for one tied block' })
  @ApiParam({ name: 'id', example: 12, description: 'Tournament id.' })
  @ApiOkResponse({ type: StandingsTableResponseDto, isArray: true })
  setTiebreaks(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: SetTiebreaksDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StandingsTableResponseDto[]> {
    return this.standingsService.setTiebreaks(
      user.organizationId as number,
      id,
      dto,
    );
  }
}
