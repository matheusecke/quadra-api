import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '../interfaces/jwt-payload.interface';

export const ORG_ROLE_KEY = 'orgRoles';

export function OrgRoles(first: OrgRole, ...rest: OrgRole[]): MethodDecorator & ClassDecorator {
  return SetMetadata(ORG_ROLE_KEY, [first, ...rest]);
}
