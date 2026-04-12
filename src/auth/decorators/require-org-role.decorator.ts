import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { OrgRole } from '../interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgRoleGuard } from '../guards/org-role.guard';

export const ORG_ROLE_KEY = 'orgRoles';

export function RequireOrgRole(first: OrgRole, ...rest: OrgRole[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ORG_ROLE_KEY, [first, ...rest]),
    UseGuards(JwtAuthGuard, OrgRoleGuard),
    ApiBearerAuth(),
  );
}
