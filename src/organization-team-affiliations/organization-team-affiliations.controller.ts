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
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { CreateTeamAffiliationDto } from './dto/create-team-affiliation.dto';
import { TeamInviteResponseDto } from './dto/team-invite-response.dto';
import { UpdateTeamAffiliationStatusDto } from './dto/update-team-affiliation-status.dto';
import { ListTeamAffiliationsQueryDto } from './dto/list-team-affiliations-query.dto';
import { TeamAffiliationResponseDto } from './dto/team-affiliation-response.dto';
import { TeamAffiliationInviteBundleDto } from './dto/team-affiliation-invite-bundle.dto';
import { ApiStandardCrudErrors } from '../common/swagger/api-error-responses.decorators';
import { ApiPaginatedOkResponse } from '../common/swagger/pagination-api.decorator';

@ApiTags('organization-team-affiliations')
@ApiBearerAuth()
@ApiStandardCrudErrors()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationTeamAffiliationsController {
  constructor(private readonly service: OrganizationTeamAffiliationsService) {}

  @Post('organizations/:orgId/team-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Invite a team to affiliate with an organization (org admin)',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiCreatedResponse({ type: TeamAffiliationInviteBundleDto })
  create(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateTeamAffiliationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.create(orgId, dto, userId);
  }

  @Get('organizations/:orgId/team-affiliations')
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({
    summary: 'List team affiliations for an organization',
    description:
      'Requires authentication; org members may use this per route guards.',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiPaginatedOkResponse(TeamAffiliationResponseDto)
  findAll(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query() query: ListTeamAffiliationsQueryDto,
  ) {
    return this.service.findAll(orgId, query);
  }

  @Get('organizations/:orgId/team-affiliations/:id')
  @ApiOperation({
    summary: 'Get a team affiliation by id within an organization',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiOkResponse({ type: TeamAffiliationResponseDto })
  findById(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findById(orgId, id);
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

  @Post('organizations/:orgId/team-affiliations/:id/resend')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @ApiOperation({
    summary: 'Re-send invite for a pending team affiliation (org admin)',
  })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiOkResponse({ type: TeamAffiliationInviteBundleDto })
  resend(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.resend(orgId, id);
  }

  @Delete('organizations/:orgId/team-affiliations/:id')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a team affiliation (org admin)' })
  @ApiParam({ name: 'orgId', example: 1, description: 'Organization id.' })
  @ApiParam({ name: 'id', example: 5, description: 'Affiliation id.' })
  @ApiNoContentResponse({ description: 'Affiliation removed.' })
  remove(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(orgId, id);
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
