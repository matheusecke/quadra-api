import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRoleGuard } from '../auth/guards/org-role.guard';
import { OrgRoles } from '../auth/decorators/org-roles.decorator';
import { SystemAdmin } from '../auth/decorators/system-admin.decorator';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { OrgRole } from '@prisma/client';
import { OrganizationUserAffiliationsService } from './organization-user-affiliations.service';
import { CreateUserAffiliationDto } from './dto/create-user-affiliation.dto';
import { UserInviteResponseDto } from './dto/user-invite-response.dto';
import { UpdateUserAffiliationDto } from './dto/update-user-affiliation.dto';
import { UpdateUserAffiliationStatusDto } from './dto/update-user-affiliation-status.dto';
import { ListUserAffiliationsQueryDto } from './dto/list-user-affiliations-query.dto';

@ApiTags('organization-user-affiliations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationUserAffiliationsController {
  constructor(private readonly service: OrganizationUserAffiliationsService) {}

  @Post('organizations/:orgId/user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  create(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateUserAffiliationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.create(orgId, dto, userId);
  }

  @Get('organizations/:orgId/user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @UseInterceptors(PaginationInterceptor)
  findAll(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query() query: ListUserAffiliationsQueryDto,
  ) {
    return this.service.findAll(orgId, query);
  }

  @Get('organizations/:orgId/user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  findById(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findById(orgId, id);
  }

  @Post('organization-user-affiliations/invite-response')
  @HttpCode(HttpStatus.OK)
  respondToInvite(
    @Body() dto: UserInviteResponseDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.respondToInvite(dto, userId);
  }

  @Patch('organizations/:orgId/user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  update(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAffiliationDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Patch('organizations/:orgId/user-affiliations/:id/status')
  @UseGuards(SystemAdminGuard)
  @SystemAdmin()
  updateStatus(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAffiliationStatusDto,
  ) {
    return this.service.updateStatus(orgId, id, dto);
  }

  @Post('organizations/:orgId/user-affiliations/:id/resend')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  resend(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.resend(orgId, id);
  }

  @Delete('organizations/:orgId/user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('isSystemAdmin') isSystemAdmin: boolean,
  ) {
    return this.service.remove(orgId, id, userId, isSystemAdmin);
  }
}
