import { BadRequestException } from '@nestjs/common';

// Lightweight pagination parsing shared by every list endpoint. GW-6 will swap
// this for class-validator transforms on the controller DTO; the surface here
// is intentionally the smallest thing that returns 400 instead of 500 for bad
// querystrings today.
export interface PaginationQueryParams {
  page?: unknown;
  pageSize?: unknown;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePagination(query: PaginationQueryParams): ParsedPagination {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page');
  const pageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
  if (pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(`pageSize must be <= ${MAX_PAGE_SIZE}`);
  }
  return { page, pageSize };
}

function parsePositiveInt(raw: unknown, defaultValue: number, fieldName: string): number {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }
  return value;
}
