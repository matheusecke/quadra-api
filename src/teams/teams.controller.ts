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
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamStatusDto } from './dto/update-team-status.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';

@ApiTags('teams')
@Controller('teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a team (system admin only)' })
  @ApiCreatedResponse({ type: TeamResponseDto })
  create(@Body() dto: CreateTeamDto): Promise<TeamResponseDto> {
    return this.teamsService.create(dto);
  }

  @Get()
  @UseInterceptors(PaginationInterceptor)
  @ApiOperation({ summary: 'List teams' })
  @ApiOkResponse({ type: [TeamResponseDto] })
  findAll(
    @Query() query: ListTeamsQueryDto,
  ): Promise<{ count: number; data: TeamResponseDto[] }> {
    return this.teamsService.findAll(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiOkResponse({ type: TeamResponseDto })
  findById(@Param('id', ParseIntApiPipe) id: number): Promise<TeamResponseDto> {
    return this.teamsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update team name (system admin only)' })
  @ApiOkResponse({ type: TeamResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    return this.teamsService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update team status (system admin only)' })
  @ApiOkResponse({ type: TeamResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateTeamStatusDto,
  ): Promise<TeamResponseDto> {
    return this.teamsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a team (system admin only)' })
  @ApiNoContentResponse()
  async softDelete(@Param('id', ParseIntApiPipe) id: number): Promise<void> {
    await this.teamsService.softDelete(id);
  }
}
