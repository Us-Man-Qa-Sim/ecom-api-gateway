import type {
  Product as ProtoProduct,
  Stock as ProtoStock,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import type { PaginationResponse } from '@us-man-qa-sim/ecom-contracts/generated/common';
import { timestampToIso } from './proto.mapper';

export interface MoneyView {
  amountMinor: number;
  currency: string;
}

export interface StockView {
  available: number;
  reserved: number;
}

export interface ProductView {
  id: string;
  name: string;
  description: string;
  category: string;
  price: MoneyView | null;
  stock: StockView | null;
  attributes: Record<string, string>;
  images: string[];
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaginationView {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductListView {
  products: ProductView[];
  pagination: PaginationView | null;
}

export function toStockView(stock: ProtoStock | undefined): StockView | null {
  if (!stock) return null;
  return { available: stock.available, reserved: stock.reserved };
}

export function toProductView(product: ProtoProduct): ProductView {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price
      ? { amountMinor: product.price.amountMinor, currency: product.price.currency }
      : null,
    stock: toStockView(product.stock),
    attributes: product.attributes ?? {},
    images: product.images ?? [],
    isActive: product.isActive,
    createdAt: timestampToIso(product.createdAt),
    updatedAt: timestampToIso(product.updatedAt),
  };
}

export function toPaginationView(
  pagination: PaginationResponse | undefined,
): PaginationView | null {
  if (!pagination) return null;
  return {
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
  };
}
