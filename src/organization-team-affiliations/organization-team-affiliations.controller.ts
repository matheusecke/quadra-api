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
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { CreateTeamAffiliationDto } from './dto/create-team-affiliation.dto';
import { TeamInviteResponseDto } from './dto/team-invite-response.dto';
import { UpdateTeamAffiliationStatusDto } from './dto/update-team-affiliation-status.dto';
import { ListTeamAffiliationsQueryDto } from './dto/list-team-affiliations-query.dto';
import { TeamAffiliationResponseDto } from './dto/team-affiliation-response.dto';
import { TeamAffiliationInviteBundleDto } from './dto/team-affiliation-invite-bundle.dto';
import { TeamAffiliationListItemDto } from './dto/team-affiliation-list-item.dto';
import { TeamAdminInvitesBundleDto } from './dto/team-admin-invites-bundle.dto';
import { Throttle } from '@nestjs/throttler';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';

@ApiTags('organization-team-affiliations')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationTeamAffiliationsController {
  constructor(private readonly service: OrganizationTeamAffiliationsService) {}

  @Post('organization-team-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary:
      'Create or reuse a team affiliation and invite one team administrator',
  })
  @ApiCreatedResponse({ type: TeamAffiliationInviteBundleDto })
  create(
    @Body() dto: CreateTeamAffiliationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamAffiliationInviteBundleDto> {
    return this.service.create(user.organizationId as number, dto, user.sub);
  }

  @Get('organization-team-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List team affiliations for the active JWT organization',
  })
  @ApiPaginatedOkResponse(TeamAffiliationListItemDto)
  findAll(
    @Query() query: ListTeamAffiliationsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(user.organizationId as number, query);
  }

  @Get('organization-team-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary:
      'Get a team affiliation by id within the active JWT organization (org admin)',
  })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findById(user.organizationId as number, id);
  }

  @Post('organization-team-affiliations/invite-response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept or reject a team affiliation invite',
    description:
      'Uses the raw invite token. Caller must be authenticated with JWT.',
  })
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  respondToInvite(@Body() dto: TeamInviteResponseDto) {
    return this.service.respondToInvite(dto);
  }

  @Patch('organizations/:orgId/team-affiliations/:id/status')
  @UseGuards(SystemAdminGuard)
  @SystemAdmin()
  @ApiOperation({ summary: 'Update team affiliation status (system admin)' })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  updateStatus(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamAffiliationStatusDto,
  ) {
    return this.service.updateStatus(orgId, id, dto);
  }

  // Invite email resend abuse: stricter than global. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('organization-team-affiliations/:id/resend')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Rotate every pending administrator invite for a team',
  })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiOkResponse({ type: TeamAdminInvitesBundleDto })
  resend(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<TeamAdminInvitesBundleDto> {
    return this.service.resend(user.organizationId as number, id);
  }

  @Delete('organization-team-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel one pending team onboarding' })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiNoContentResponse({ description: 'Pending onboarding cancelled.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.service.remove(user.organizationId as number, id);
  }

  @Post('organization-team-affiliations/:id/deactivate')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deactivate(user.organizationId as number, id);
  }

  @Post('organization-team-affiliations/:id/activate')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.activate(user.organizationId as number, id);
  }

  @Get('teams/:teamId/affiliations')
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List organization affiliations for a team',
    description: 'Paginated list scoped by global `teamId`.',
  })
  @ApiParam({ name: 'teamId', example: 3, description: 'Team id.' })
  @ApiPaginatedOkResponse(TeamAffiliationResponseDto)
  findByTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: ListTeamAffiliationsQueryDto,
  ) {
    return this.service.findByTeam(teamId, query);
  }
}
