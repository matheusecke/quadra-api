import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AthletesService } from './athletes.service';
import { ListAthletesQueryDto } from './dto/list-athletes-query.dto';
import { AthleteCatalogResponseDto } from './dto/athlete-catalog-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { ANY_ORG_ROLE, OrgRoles } from '../auth/decorators/org-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

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
}
