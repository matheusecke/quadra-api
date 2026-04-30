import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
// Namespace import required: 'isolatedModules' + 'emitDecoratorMetadata' need a runtime
// value reference when the type appears in a decorated parameter position.
import * as express from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { OrgAffiliationDto } from './dto/org-affiliation.dto';
import { ChooseOrgDto } from './dto/choose-org.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ApiException } from '../common/exceptions/api.exception';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate user and receive tokens' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<LoginResponseDto> {
    const { rawRefreshToken, ...response } = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(res, rawRefreshToken);
    return response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refresh(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<TokenResponseDto> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)?.refreshToken;
    if (!rawToken) {
      throw ApiException.unauthorized('Refresh token not provided.');
    }
    const { accessToken, newRawRefreshToken } = await this.authService.refreshAccessToken(rawToken);
    this.setRefreshCookie(res, newRawRefreshToken);
    return { accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke refresh token and end session' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<void> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)?.refreshToken;
    await this.authService.logout(user.sub, rawToken);
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: JwtPayload): Promise<MeResponseDto> {
    return this.authService.getMe(user.sub, user.organizationId, user.role);
  }

  @Get('org')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List organizations where the current user has affiliation' })
  async getOrgs(@CurrentUser() user: JwtPayload): Promise<OrgAffiliationDto[]> {
    return this.authService.getUserOrgs(user.sub);
  }

  @Post('org')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Choose an organization and receive an org-scoped access token' })
  async chooseOrg(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChooseOrgDto,
  ): Promise<TokenResponseDto> {
    return this.authService.chooseOrg(user.sub, dto.organizationId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change current user password (requires current password)' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  private setRefreshCookie(res: express.Response, token: string): void {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
