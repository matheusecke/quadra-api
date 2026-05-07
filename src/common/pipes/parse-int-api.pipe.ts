import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { ApiException } from '../exceptions/api.exception';

@Injectable()
export class ParseIntApiPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const isPositiveDecimalInteger =
      typeof value === 'string' && /^[1-9]\d*$/.test(value);
    const parsed = isPositiveDecimalInteger ? Number(value) : Number.NaN;

    if (!Number.isSafeInteger(parsed)) {
      const field = metadata.data ?? 'value';
      throw ApiException.badRequest(
        `${field} must be a positive integer.`,
        'VALIDATION_ERROR',
        { [field]: ['must be a positive integer'] },
      );
    }

    return parsed;
  }
}
