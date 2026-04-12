import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { ApiException } from '../../common/exceptions/api.exception';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  private readonly adminSecret: Buffer;

  constructor(configService: ConfigService) {
    this.adminSecret = Buffer.from(configService.getOrThrow<string>('ADMIN_SECRET'));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-secret'];

    if (!provided || Array.isArray(provided)) {
      throw ApiException.unauthorized('Invalid admin secret.');
    }

    const providedBuf = Buffer.from(provided);

    const same =
      providedBuf.byteLength === this.adminSecret.byteLength &&
      timingSafeEqual(providedBuf, this.adminSecret);

    if (!same) {
      throw ApiException.unauthorized('Invalid admin secret.');
    }

    return true;
  }
}
