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
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { UpdateSeasonStatusDto } from './dto/update-season-status.dto';
import { ListSeasonsQueryDto } from './dto/list-seasons-query.dto';
import { SeasonResponseDto } from './dto/season-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('seasons')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List seasons of the active JWT organization' })
  @ApiPaginatedOkResponse(SeasonResponseDto)
  findAll(
    @Query() query: ListSeasonsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: SeasonResponseDto[] }> {
    return this.seasonsService.findAll(user.organizationId as number, query);
  }

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a season (org admin)' })
  @ApiCreatedResponse({ type: SeasonResponseDto })
  create(
    @Body() dto: CreateSeasonDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SeasonResponseDto> {
    return this.seasonsService.create(user.organizationId as number, dto);
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Update season label and dates (org admin)' })
  @ApiParam({ name: 'id', example: 3, description: 'Season id.' })
  @ApiOkResponse({ type: SeasonResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateSeasonDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SeasonResponseDto> {
    return this.seasonsService.update(user.organizationId as number, id, dto);
  }

  @Patch(':id/status')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Update season status (org admin)' })
  @ApiParam({ name: 'id', example: 3, description: 'Season id.' })
  @ApiOkResponse({ type: SeasonResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateSeasonStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SeasonResponseDto> {
    return this.seasonsService.updateStatus(
      user.organizationId as number,
      id,
      dto,
    );
  }
}
