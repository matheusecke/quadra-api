import { ApiProperty } from '@nestjs/swagger';

/** Error payload shape returned by ApiExceptionFilter and PrismaExceptionFilter. */
export class ApiErrorBodyDto {
  @ApiProperty({ example: 'Bad Request' })
  title!: string;

  @ApiProperty({ example: 'Invalid data in request.' })
  message!: string;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({
    example: { email: ['email must be an email'] },
    description: 'Structured context (e.g. validation field errors).',
  })
  data!: Record<string, unknown>;
}

/** Top-level JSON body for 4xx/5xx API errors. */
export class ApiErrorEnvelopeDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty({ example: 400 })
  statusCode!: number;
}
