// src/users/users.controller.ts
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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaginationInterceptor } from '../common/interceptors/pagination.interceptor';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetSystemAdminDto } from './dto/set-system-admin.dto';
import { ParseIntApiPipe } from '../common/pipes/parse-int-api.pipe';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a global user as a system admin' })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @UseInterceptors(PaginationInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users as a system admin' })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<{ count: number; data: UserResponseDto[] }> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a user as a system admin' })
  @ApiOkResponse({ type: UserResponseDto })
  findById(@Param('id', ParseIntApiPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user profile as a system admin' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user status as a system admin' })
  @ApiOkResponse({ type: UserResponseDto })
  updateStatus(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.usersService.updateStatus(id, dto, currentUser);
  }

  @Patch(':id/system-admin')
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update platform admin access as a system admin' })
  @ApiOkResponse({ type: UserResponseDto })
  setSystemAdmin(
    @Param('id', ParseIntApiPipe) id: number,
    @Body() dto: SetSystemAdminDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.usersService.setSystemAdmin(id, dto, currentUser);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, SystemAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a user as a system admin' })
  @ApiNoContentResponse()
  async softDelete(
    @Param('id', ParseIntApiPipe) id: number,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<void> {
    await this.usersService.softDelete(id, currentUser);
  }
}
