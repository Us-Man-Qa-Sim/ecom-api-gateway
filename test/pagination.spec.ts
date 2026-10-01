import { BadRequestException } from '@nestjs/common';
import { parsePagination } from '../src/common/dto/pagination.dto';

describe('parsePagination', () => {
  it('applies defaults for empty input', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string querystring values', () => {
    expect(parsePagination({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects zero and negative values', () => {
    expect(() => parsePagination({ page: '0' })).toThrow(BadRequestException);
    expect(() => parsePagination({ page: '-1' })).toThrow(BadRequestException);
    expect(() => parsePagination({ pageSize: '0' })).toThrow(BadRequestException);
  });

  it('rejects non-integers', () => {
    expect(() => parsePagination({ page: '1.5' })).toThrow(BadRequestException);
    expect(() => parsePagination({ page: 'abc' })).toThrow(BadRequestException);
  });

  it('caps pageSize at 100', () => {
    expect(() => parsePagination({ pageSize: '101' })).toThrow(BadRequestException);
    expect(parsePagination({ pageSize: '100' })).toEqual({ page: 1, pageSize: 100 });
  });

  it('treats empty strings as defaults', () => {
    expect(parsePagination({ page: '', pageSize: '' })).toEqual({ page: 1, pageSize: 20 });
  });
});
