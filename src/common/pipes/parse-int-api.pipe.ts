import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { ApiException } from '../exceptions/api.exception';

@Injectable()
export class ParseIntApiPipe implements PipeTransform<string | number, number> {
  // NOTE: global ValidationPipe with transform:true converts @Param strings to
  // numbers before this pipe runs, so we must handle both input types.
  transform(value: string | number, metadata: ArgumentMetadata): number {
    const parsed =
      typeof value === 'number'
        ? value
        : /^[1-9]\d*$/.test(value)
          ? Number(value)
          : Number.NaN;

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
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
