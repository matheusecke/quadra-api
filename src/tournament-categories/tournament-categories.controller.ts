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
import { TournamentCategoriesService } from './tournament-categories.service';
import { CreateTournamentCategoryDto } from './dto/create-tournament-category.dto';
import { UpdateTournamentCategoryDto } from './dto/update-tournament-category.dto';
import { UpdateTournamentCategoryStatusDto } from './dto/update-tournament-category-status.dto';
import { ListTournamentCategoriesQueryDto } from './dto/list-tournament-categories-query.dto';
import { TournamentCategoryResponseDto } from './dto/tournament-category-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('tournament-categories')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('tournament-categories')
export class TournamentCategoriesController {
  constructor(
    private readonly categoriesService: TournamentCategoriesService,
  ) {}

  @Get()
  @OrgRoles(...ANY_ORG_ROLE)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List tournament categories of the active JWT organization',
  })
  @ApiPaginatedOkResponse(TournamentCategoryResponseDto)
  findAll(
    @Query() query: ListTournamentCategoriesQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ count: number; data: TournamentCategoryResponseDto[] }> {
    return this.categoriesService.findAll(user.organizationId as number, query);
  }

  @Post()
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tournament category (org admin)' })
  @ApiCreatedResponse({ type: TournamentCategoryResponseDto })
  create(
    @Body() dto: CreateTournamentCategoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentCategoryResponseDto> {
    return this.categoriesService.create(user.organizationId as number, dto);
  }

  @Patch(':id')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Update category name and sort order (org admin)' })
  @ApiParam({ name: 'id', example: 6, description: 'Tournament category id.' })
  @ApiOkResponse({ type: TournamentCategoryResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentCategoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentCategoryResponseDto> {
    return this.categoriesService.update(
      user.organizationId as number,
      id,
      dto,
    );
  }

  @Patch(':id/status')
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Update category status (org admin)' })
  @ApiParam({ name: 'id', example: 6, description: 'Tournament category id.' })
  @ApiOkResponse({ type: TournamentCategoryResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTournamentCategoryStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TournamentCategoryResponseDto> {
    return this.categoriesService.updateStatus(
      user.organizationId as number,
      id,
      dto,
    );
  }
}
