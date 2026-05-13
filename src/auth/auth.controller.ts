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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
// Namespace import required: 'isolatedModules' + 'emitDecoratorMetadata' need a runtime
// value reference when the type appears in a decorated parameter position.
import * as express from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
import {
  ApiBadRequestErrorResponse,
  ApiConflictErrorResponse,
  ApiForbiddenErrorResponse,
  ApiNotFoundErrorResponse,
  ApiUnauthorizedErrorResponse,
  ApiUnprocessableEntityErrorResponse,
} from '../common/swagger/api-error-responses.decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Stricter than global limit: credential stuffing / registration abuse. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Register user and receive tokens',
    description:
      'Creates an active user, issues an access token (JWT), and sets the httpOnly `refreshToken` cookie.',
  })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiBadRequestErrorResponse()
  @ApiConflictErrorResponse()
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<LoginResponseDto> {
    const { rawRefreshToken, ...response } =
      await this.authService.register(dto);
    this.setRefreshCookie(res, rawRefreshToken);
    return response;
  }

  // Stricter than global limit: brute-force risk on passwords. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Authenticate user and receive tokens',
    description:
      'Returns a JWT access token and sets the httpOnly `refreshToken` cookie.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestErrorResponse()
  @ApiUnauthorizedErrorResponse()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<LoginResponseDto> {
    const { rawRefreshToken, ...response } = await this.authService.login(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, rawRefreshToken);
    return response;
  }

  // Session rotation abuse: stricter than global. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiSecurity('refreshToken')
  @ApiOperation({
    summary: 'Rotate refresh token and issue new access token',
    description:
      'Reads the `refreshToken` cookie, validates it, rotates the session, sets a new cookie, and returns a new access token.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedErrorResponse()
  async refresh(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<TokenResponseDto> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)
      ?.refreshToken;
    if (!rawToken) {
      throw ApiException.unauthorized('Refresh token not provided.');
    }
    const { accessToken, newRawRefreshToken } =
      await this.authService.refreshAccessToken(rawToken);
    this.setRefreshCookie(res, newRawRefreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity('refreshToken')
  @ApiOperation({
    summary: 'Revoke refresh token and end session',
    description:
      'Revokes the current refresh session and clears the `refreshToken` cookie.',
  })
  @ApiNoContentResponse({
    description: 'Session ended (no response body).',
  })
  async logout(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<void> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)
      ?.refreshToken;
    await this.authService.logout(rawToken);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Uses the Bearer access token. `organizationId` and `role` reflect the org context encoded in that token.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedErrorResponse()
  @ApiNotFoundErrorResponse()
  async me(@CurrentUser() user: JwtPayload): Promise<MeResponseDto> {
    return this.authService.getMe(user.sub, user.organizationId, user.role);
  }

  @Get('org')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organizations where the current user has affiliation',
    description: 'Returns active affiliations with org metadata and role.',
  })
  @ApiOkResponse({ type: [OrgAffiliationDto] })
  @ApiUnauthorizedErrorResponse()
  async getOrgs(@CurrentUser() user: JwtPayload): Promise<OrgAffiliationDto[]> {
    return this.authService.getUserOrgs(user.sub);
  }

  // Org context switch + refresh rotation: stricter than global. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('org')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiSecurity('refreshToken')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Choose an organization and receive an org-scoped access token',
    description:
      'Requires Bearer authentication plus the `refreshToken` cookie. Rotates the refresh session and returns an access token scoped to the chosen organization.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiBadRequestErrorResponse()
  @ApiUnauthorizedErrorResponse()
  @ApiForbiddenErrorResponse()
  @ApiNotFoundErrorResponse()
  @ApiUnprocessableEntityErrorResponse()
  async chooseOrg(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChooseOrgDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<TokenResponseDto> {
    const rawToken: string | undefined = (req.cookies as Record<string, string>)
      ?.refreshToken;
    if (!rawToken) {
      throw ApiException.unauthorized('Refresh token not provided.');
    }

    const { rawRefreshToken, ...response } = await this.authService.chooseOrg(
      user.sub,
      dto.organizationId,
      rawToken,
    );
    this.setRefreshCookie(res, rawRefreshToken);
    return response;
  }

  // Account takeover surface: stricter than global. Details: docs/HTTP-LAYER.md (Rate limiting).
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change current user password (requires current password)',
  })
  @ApiNoContentResponse({ description: 'Password updated.' })
  @ApiBadRequestErrorResponse()
  @ApiUnauthorizedErrorResponse()
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private setRefreshCookie(res: express.Response, token: string): void {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: this.authService.getRefreshCookieMaxAgeMs(),
    });
  }
}
