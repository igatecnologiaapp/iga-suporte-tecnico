import { test } from "node:test";
import assert from "node:assert/strict";
import { adminUserUpdateSchema, planAdminUserUpdate } from "../../src/lib/admin-user-update.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const primary = "00000000-0000-4000-8000-000000000003";
const state = {
  actorId: actor,
  primaryId: primary,
  currentRole: "viewer",
  currentModules: ["tickets"],
};

test("invalid identifiers, fields, roles, status and modules are rejected before RPC", () => {
  for (const patch of [
    { userId: "invalid" },
    { actorId: primary },
    { role: "root" },
    { status: "disabled" },
    { modules: ["unknown"] },
    { technicianId: "missing" },
    { phone: 123 },
    { role: null },
    { modules: null },
  ])
    assert.equal(adminUserUpdateSchema.safeParse({ userId: target, ...patch }).success, false);
});

test("ordinary admin basic edits keep unchanged role and modules", () => {
  const input = adminUserUpdateSchema.parse({
    userId: target,
    fullName: " Nome ",
    role: "viewer",
    modules: ["tickets", "tickets"],
  });
  const plan = planAdminUserUpdate(input, state);
  assert.equal(plan.fullName, "Nome");
  assert.deepEqual(plan.modules, ["tickets"]);
});

test("mixed profile and forbidden role is rejected by read-only preflight", () => {
  assert.throws(
    () => planAdminUserUpdate({ userId: target, fullName: "Changed", role: "admin" }, state),
    /Principal/,
  );
});

test("mixed profile and forbidden modules is rejected by read-only preflight", () => {
  assert.throws(
    () => planAdminUserUpdate({ userId: target, phone: "123", modules: ["inbox"] }, state),
    /Principal/,
  );
});

test("principal protection applies before basic changes and input is not mutated", () => {
  assert.throws(
    () => planAdminUserUpdate({ userId: primary, fullName: "Changed" }, state),
    /só pode/,
  );
  const self = { ...state, actorId: primary, currentRole: "admin" };
  assert.throws(
    () => planAdminUserUpdate({ userId: primary, status: "inactive" }, self),
    /desativado/,
  );
  const input = { userId: primary, fullName: "Principal", modules: ["tickets"] as ["tickets"] };
  assert.equal(planAdminUserUpdate(input, self).modules, undefined);
  assert.deepEqual(input.modules, ["tickets"]);
});

test("primary may change another user's role and modules", () => {
  const input = adminUserUpdateSchema.parse({
    userId: target,
    role: "technician",
    modules: ["tickets", "companies"],
  });
  assert.deepEqual(planAdminUserUpdate(input, { ...state, actorId: primary }), input);
});

test("absence of a primary never gives ordinary actor primary privileges", () => {
  assert.throws(
    () => planAdminUserUpdate({ userId: target, role: "admin" }, { ...state, primaryId: null }),
    /Principal/,
  );
});
