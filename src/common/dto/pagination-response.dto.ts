export class PaginationMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;

  constructor(totalItems: number, itemsPerPage: number, currentPage: number) {
    this.totalItems = totalItems;
    this.itemsPerPage = itemsPerPage;
    this.currentPage = currentPage;
    this.itemCount = Math.min(itemsPerPage, Math.max(0, totalItems - (currentPage - 1) * itemsPerPage));
    this.totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  }
}

export class PaginationLinks {
  first: string;
  previous: string | null;
  next: string | null;
  last: string;
}

export class PaginationResponseDto<T> {
  data: T[];
  meta: PaginationMeta;
  links: PaginationLinks;
  statusCode: number;
}
