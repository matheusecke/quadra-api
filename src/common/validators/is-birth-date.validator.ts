import { registerDecorator, type ValidationOptions } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGE_YEARS = 120;

export const BIRTH_DATE_MESSAGE =
  'Birth date must be a real past date within the last 120 years.';

// UTC midnight, the same instant convention as `AuthService.parseDateOnly`.
function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function isBirthDate(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;

  // Round-trip guard: `Date` rolls 2026-02-30 over to March 2nd instead of
  // failing, so a well-formed but non-existent day only shows up here.
  if (parsed.toISOString().slice(0, 10) !== value) return false;

  const today = todayUtc();
  if (parsed.getTime() > today.getTime()) return false;

  const oldest = new Date(today);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_AGE_YEARS);

  return parsed.getTime() >= oldest.getTime();
}

export function IsBirthDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      name: 'isBirthDate',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isBirthDate(value),
        defaultMessage: () => BIRTH_DATE_MESSAGE,
      },
    });
  };
}
