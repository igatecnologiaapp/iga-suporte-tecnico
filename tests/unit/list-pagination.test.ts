import { test } from "node:test";
import assert from "node:assert/strict";
import { listPageSchema, pageRange } from "../../src/lib/list-pagination.ts";
test("pagination handles an empty list and clamps a removed last page", () => {
  assert.deepEqual(pageRange(0, 1, 5), { page: 1, pages: 1, start: 0, end: 0 });
  assert.deepEqual(pageRange(12, 99, 5), { page: 3, pages: 3, start: 11, end: 12 });
  assert.deepEqual(pageRange(12, 1, 50), { page: 1, pages: 1, start: 1, end: 12 });
});
test("page request accepts bounded presets and no identity or extra parameters", () => {
  assert.deepEqual(listPageSchema.parse({}), { page: 1, pageSize: 5 });
  for (const input of [
    { page: 0 },
    { page: 1.5 },
    { page: 1_000_001 },
    { pageSize: 500 },
    { actorId: "injected" },
  ])
    assert.throws(() => listPageSchema.parse(input));
});
