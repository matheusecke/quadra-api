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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
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
import { UserAffiliationResponseDto } from './dto/user-affiliation-response.dto';
import { UserAffiliationInviteBundleDto } from './dto/user-affiliation-invite-bundle.dto';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';

@ApiTags('organization-user-affiliations')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationUserAffiliationsController {
  constructor(private readonly service: OrganizationUserAffiliationsService) {}

  @Post('organizations/:orgId/user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Invite or add a user affiliation (org admin)',
    description:
      'Creates a PENDING affiliation and returns a raw invite token for non-admin roles. ORG_ADMIN may omit `teamId`.',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiCreatedResponse({ type: UserAffiliationInviteBundleDto })
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
  @ApiOperation({
    summary: 'List user affiliations for an organization (org admin)',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiPaginatedOkResponse(UserAffiliationResponseDto)
  findAll(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query() query: ListUserAffiliationsQueryDto,
  ) {
    return this.service.findAll(orgId, query);
  }

  @Get('organizations/:orgId/user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get a user affiliation by id (org admin)' })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  findById(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findById(orgId, id);
  }

  @Post('organization-user-affiliations/invite-response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept or reject a user affiliation invite',
    description:
      'Authenticated user responds to their own pending invite using the raw token from email/admin channel.',
  })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  respondToInvite(
    @Body() dto: UserInviteResponseDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.respondToInvite(dto, userId);
  }

  @Patch('organizations/:orgId/user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Update an active user affiliation (org admin)',
    description:
      'Role, team, or jersey number updates for ACTIVE affiliations.',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
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
  @ApiOperation({
    summary: 'Update affiliation status (system admin)',
    description: 'Bypasses org-admin rules for status transitions.',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
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
  @ApiOperation({
    summary: 'Re-send invite for a pending affiliation (org admin)',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationInviteBundleDto })
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
  @ApiOperation({
    summary: 'Soft-delete a user affiliation (org admin)',
    description:
      'System admins may remove any affiliation; org admins cannot remove their own.',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiNoContentResponse({ description: 'Affiliation removed.' })
  remove(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('isSystemAdmin') isSystemAdmin: boolean,
  ) {
    return this.service.remove(orgId, id, userId, isSystemAdmin);
  }
}
