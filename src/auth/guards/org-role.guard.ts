import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiException } from '../../common/exceptions/api.exception';
import type { JwtPayload, OrgRole } from '../interfaces/jwt-payload.interface';
import { ORG_ROLE_KEY } from '../decorators/require-org-role.decorator';

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ORG_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    // Defensive: JwtAuthGuard runs first via RequireOrgRole and would have already
    // rejected the request if the token is missing. This branch handles standalone use.
    if (!user) {
      throw ApiException.unauthorized('Authentication required.');
    }

    if (!user.role || !requiredRoles.includes(user.role)) {
      throw ApiException.forbidden('Insufficient permissions.');
    }

    return true;
  }
}
