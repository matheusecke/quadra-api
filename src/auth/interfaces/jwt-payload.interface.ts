import type { OrgRole } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  organizationId: number | null;
  role: OrgRole | null;
}

export type { OrgRole };
