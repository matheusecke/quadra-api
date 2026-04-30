import { SetMetadata } from '@nestjs/common';

export const SYSTEM_ADMIN_KEY = 'systemAdmin';

export function SystemAdmin(): MethodDecorator & ClassDecorator {
  return SetMetadata(SYSTEM_ADMIN_KEY, true);
}
