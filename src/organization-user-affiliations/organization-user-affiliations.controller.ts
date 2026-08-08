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
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { OrgRole } from '@prisma/client';
import { OrganizationUserAffiliationsService } from './organization-user-affiliations.service';
import { CreateUserAffiliationDto } from './dto/create-user-affiliation.dto';
import { CreateTeamMemberAffiliationDto } from './dto/create-team-member-affiliation.dto';
import { UserInviteResponseDto } from './dto/user-invite-response.dto';
import { UpdateUserAffiliationDto } from './dto/update-user-affiliation.dto';
import { UpdateUserAffiliationStatusDto } from './dto/update-user-affiliation-status.dto';
import { ListUserAffiliationsQueryDto } from './dto/list-user-affiliations-query.dto';
import { UserAffiliationResponseDto } from './dto/user-affiliation-response.dto';
import { UserAffiliationListItemDto } from './dto/user-affiliation-list-item.dto';
import { UserAffiliationInviteBundleDto } from './dto/user-affiliation-invite-bundle.dto';
import { Throttle } from '@nestjs/throttler';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';

@ApiTags('organization-user-affiliations')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationUserAffiliationsController {
  constructor(private readonly service: OrganizationUserAffiliationsService) {}

  @Post('organization-user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Invite an org admin to the active JWT organization (org admin)',
    description:
      'Creates a PENDING ORG_ADMIN affiliation and returns a raw invite token for delivery.',
  })
  @ApiCreatedResponse({ type: UserAffiliationInviteBundleDto })
  createOrganizationAdmin(
    @Body() dto: CreateUserAffiliationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createOrganizationAdmin(
      user.organizationId as number,
      dto.userId,
      user.sub,
    );
  }

  @Post('teams/:teamId/organization-user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.TEAM_ADMIN)
  @ApiOperation({
    summary:
      'Invite an athlete or coaching staff member to a team (team admin)',
    description:
      "Creates a PENDING affiliation for the given team and returns a raw invite token for delivery. Restricted to the caller's own actively affiliated team.",
  })
  @ApiParam({ name: 'teamId', example: 8, description: 'Team id.' })
  @ApiCreatedResponse({ type: UserAffiliationInviteBundleDto })
  createTeamMember(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateTeamMemberAffiliationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createTeamMember(
      user.organizationId as number,
      teamId,
      dto,
      user.sub,
    );
  }

  @Get('organization-user-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary:
      'List user affiliations for the active JWT organization (org admin, team admin)',
  })
  @ApiPaginatedOkResponse(UserAffiliationListItemDto)
  findAll(
    @Query() query: ListUserAffiliationsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(user.organizationId as number, query, {
      userId: user.sub,
      role: user.role as OrgRole,
    });
  }

  @Get('organization-user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary:
      'Get a user affiliation by id in the active JWT organization (org admin)',
  })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findById(user.organizationId as number, id);
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

  @Patch('organization-user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.TEAM_ADMIN)
  @ApiOperation({
    summary: 'Update an active athlete or staff member from the own team',
  })
  @ApiParam({ name: 'id', example: 10, description: 'Affiliation id.' })
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  updateMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAffiliationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateMember(
      user.organizationId as number,
      id,
      dto,
      user.sub,
    );
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

  // Invite email resend abuse: stricter than global. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('organization-user-affiliations/:id/resend')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate one manageable pending user invite' })
  @ApiOkResponse({ type: UserAffiliationInviteBundleDto })
  resend(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resend(user.organizationId as number, id, {
      userId: user.sub,
      role: user.role as OrgRole,
    });
  }

  @Delete('organization-user-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel one manageable pending user invite' })
  @ApiNoContentResponse({ description: 'Pending invite cancelled.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.service.remove(user.organizationId as number, id, {
      userId: user.sub,
      role: user.role as OrgRole,
    });
  }

  @Post('organization-user-affiliations/:id/deactivate')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deactivate(user.organizationId as number, id, {
      userId: user.sub,
      role: user.role as OrgRole,
    });
  }

  @Post('organization-user-affiliations/:id/activate')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN, OrgRole.TEAM_ADMIN)
  @ApiOkResponse({ type: UserAffiliationResponseDto })
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.activate(user.organizationId as number, id, {
      userId: user.sub,
      role: user.role as OrgRole,
    });
  }
}
