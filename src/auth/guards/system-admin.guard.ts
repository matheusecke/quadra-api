import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiException } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw ApiException.unauthorized('Authentication required.');
    }

    if (!user.isSystemAdmin) {
      throw ApiException.forbidden('Insufficient permissions.');
    }

    return true;
  }
}
