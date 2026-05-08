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
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { CreateTeamAffiliationDto } from './dto/create-team-affiliation.dto';
import { TeamInviteResponseDto } from './dto/team-invite-response.dto';
import { UpdateTeamAffiliationStatusDto } from './dto/update-team-affiliation-status.dto';
import { ListTeamAffiliationsQueryDto } from './dto/list-team-affiliations-query.dto';

@ApiTags('organization-team-affiliations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrganizationTeamAffiliationsController {
  constructor(private readonly service: OrganizationTeamAffiliationsService) {}

  @Post('organizations/:orgId/team-affiliations')
  @UseGuards(OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_ADMIN)
  create(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateTeamAffiliationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.create(orgId, dto, userId);
  }

  @Get('organizations/:orgId/team-affiliations')
  @UseInterceptors(PaginationInterceptor)
  findAll(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query() query: ListTeamAffiliationsQueryDto,
  ) {
    return this.service.findAll(orgId, query);
  }

  @Get('organizations/:orgId/team-affiliations/:id')
  findById(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findById(orgId, id);
  }

  @Post('organization-team-affiliations/invite-response')
  @HttpCode(HttpStatus.OK)
  respondToInvite(@Body() dto: TeamInviteResponseDto) {
    return this.service.respondToInvite(dto);
  }

  @Patch('organizations/:orgId/team-affiliations/:id/status')
  @UseGuards(SystemAdminGuard)
  @SystemAdmin()
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
  remove(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(orgId, id);
  }

  @Get('teams/:teamId/affiliations')
  @UseInterceptors(PaginationInterceptor)
  findByTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: ListTeamAffiliationsQueryDto,
  ) {
    return this.service.findByTeam(teamId, query);
  }
}
