import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 42 })
  totalItems!: number;

  @ApiProperty({ example: 10 })
  itemCount!: number;

  @ApiProperty({ example: 10 })
  itemsPerPage!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;

  @ApiProperty({ example: 1 })
  currentPage!: number;

  constructor(totalItems: number, itemsPerPage: number, currentPage: number) {
    this.totalItems = totalItems;
    this.itemsPerPage = itemsPerPage;
    this.currentPage = currentPage;
    this.itemCount = Math.min(
      itemsPerPage,
      Math.max(0, totalItems - (currentPage - 1) * itemsPerPage),
    );
    this.totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  }
}

export class PaginationLinks {
  @ApiProperty({
    example:
      'http://localhost:3001/organizations/1/user-affiliations?page=1&limit=10',
  })
  first!: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Null on the first page.',
  })
  previous!: string | null;

  @ApiProperty({
    example:
      'http://localhost:3001/organizations/1/user-affiliations?page=2&limit=10',
    nullable: true,
    description: 'Null when there is no next page.',
  })
  next!: string | null;

  @ApiProperty({
    example:
      'http://localhost:3001/organizations/1/user-affiliations?page=5&limit=10',
  })
  last!: string;
}

/** Runtime envelope for paginated JSON; Swagger uses `ApiPaginatedOkResponse` per item type. */
export class PaginationResponseDto<T> {
  data!: T[];
  meta!: PaginationMeta;
  links!: PaginationLinks;
  statusCode!: number;
}
