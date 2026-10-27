/** Área: Contratos de página, contadores e intervalos exibidos nos rodapés. */
import { z } from "zod";
export const DEFAULT_PAGE_SIZE = 5;
export const PAGE_SIZES = [5, 10, 20, 50] as const;
export const listPageSchema = z
  .object({
    page: z.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)]).default(5),
  })
  .strict();
const countSchema = z.object({
  all: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  inactive: z.number().int().nonnegative(),
});
export const pagedRecordsSchema = z
  .object({
    rows: z.array(z.record(z.unknown())),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    counts: countSchema,
    summary: countSchema,
    queues: z.record(z.number().int().nonnegative()),
  })
  .refine((value) => value.rows.length <= value.pageSize && value.rows.length <= value.total);
/** Calcula limites e posição válida de uma página, inclusive quando a lista está vazia. */
export function pageRange(total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  return {
    page: current,
    pages,
    start: total ? (current - 1) * pageSize + 1 : 0,
    end: Math.min(current * pageSize, total),
  };
}
