import type { OrgRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  role: OrgRole | null;
}

export type { OrgRole };
