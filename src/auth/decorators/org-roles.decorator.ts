import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import type { OrgRole as OrgRoleType } from '../interfaces/jwt-payload.interface';

export const ORG_ROLE_KEY = 'orgRoles';

/** Every org role. Use for reads open to any member of the organization: `@OrgRoles(...ANY_ORG_ROLE)`. */
export const ANY_ORG_ROLE = [
  OrgRole.ORG_ADMIN,
  OrgRole.TEAM_ADMIN,
  OrgRole.ATHLETE,
  OrgRole.COACHING_STAFF,
] as const;

export function OrgRoles(
  first: OrgRoleType,
  ...rest: OrgRoleType[]
): MethodDecorator & ClassDecorator {
  return SetMetadata(ORG_ROLE_KEY, [first, ...rest]);
}
