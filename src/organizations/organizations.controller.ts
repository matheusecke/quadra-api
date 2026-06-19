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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiStandardCrudErrors()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an organization (system admin only)' })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  create(@Body() dto: CreateOrganizationDto): Promise<OrganizationResponseDto> {
    return this.organizationsService.create(dto);
  }

  @Get()
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List organizations' })
  @ApiPaginatedOkResponse(OrganizationResponseDto)
  findAll(
    @Query() query: ListOrganizationsQueryDto,
  ): Promise<{ count: number; data: OrganizationResponseDto[] }> {
    return this.organizationsService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an organization by ID' })
  @ApiParam({ name: 'id', example: 1, description: 'Organization id.' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  findById(
    @Param('id', ParseIntApiPipe) id: number,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update organization name (system admin or own ORG_ADMIN)',
  })
  @ApiParam({ name: 'id', example: 1, description: 'Organization id.' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update organization status (system admin only)' })
  @ApiParam({ name: 'id', example: 1, description: 'Organization id.' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateOrganizationStatusDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete an organization (system admin only)' })
  @ApiParam({ name: 'id', example: 1, description: 'Organization id.' })
  @ApiNoContentResponse()
  async softDelete(@Param('id', ParseIntApiPipe) id: number): Promise<void> {
    await this.organizationsService.softDelete(id);
  }
}
