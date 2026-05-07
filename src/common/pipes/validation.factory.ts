import { ValidationError } from '@nestjs/common';
import { ApiException } from '../exceptions/api.exception';

export function validationExceptionFactory(
  errors: ValidationError[],
): ApiException {
  const data: Record<string, string[]> = {};

  const flattenErrors = (errs: ValidationError[], parentKey = ''): void => {
    for (const err of errs) {
      const key = parentKey ? `${parentKey}.${err.property}` : err.property;
      if (err.constraints) {
        data[key] = Object.values(err.constraints);
      }
      if (err.children && err.children.length > 0) {
        flattenErrors(err.children, key);
      }
    }
  };

  flattenErrors(errors);
  return ApiException.badRequest(
    'Invalid data in request.',
    'VALIDATION_ERROR',
    data,
  );
}
