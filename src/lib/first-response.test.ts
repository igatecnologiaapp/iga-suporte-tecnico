import { test, expect } from 'bun:test';
import { needsFirstResponse, soundDue, FIRST_RESPONSE_LIMIT_SECONDS, RESPONSE_SOUND_INTERVAL_SECONDS } from './first-response';
const opened_at = '2026-10-22T08:00:00Z';
const start = Date.parse(opened_at);
const ticket = { opened_at, status: 'new', validResponse: false };
test('180 seconds are not overdue, only more than 180', () => {
  expect(FIRST_RESPONSE_LIMIT_SECONDS).toBe(180);
  expect(needsFirstResponse(ticket, start + 179000)).toBe(false);
  expect(needsFirstResponse(ticket, start + 180000)).toBe(false);
  expect(needsFirstResponse(ticket, start + 180001)).toBe(true);
});
test('valid communication stops the alert', () => { expect(needsFirstResponse({ ...ticket, validResponse: true }, start + 200000)).toBe(false); });
test('assignment acknowledgment and operational status do not count', () => {
  for (const status of ['new', 'triage', 'in_progress', 'scheduled', 'waiting_customer', 'waiting_third_party', 'reopened']) expect(needsFirstResponse({ ...ticket, status }, start + 200000)).toBe(true);
});
test('legitimate cancellation duplicate resolution and closure are excluded', () => {
  for (const status of ['cancelled', 'duplicate', 'resolved', 'closed']) expect(needsFirstResponse({ ...ticket, status }, start + 200000)).toBe(false);
});
test('one consolidated cycle every 60 seconds for three tickets', () => {
  expect(RESPONSE_SOUND_INTERVAL_SECONDS).toBe(60);
  expect(soundDue(59999, 0, 3, 0)).toBe(false);
  expect(soundDue(60000, 0, 3, 0)).toBe(true);
  expect(soundDue(60001, 60000, 3, 0)).toBe(false);
});
test('temporary silence keeps eligibility but stops sound', () => {
  expect(needsFirstResponse(ticket, start + 200000)).toBe(true);
  expect(soundDue(60000, 0, 3, 300000)).toBe(false);
  expect(soundDue(300000, 0, 3, 300000)).toBe(true);
});
test('no sound without pending tickets', () => expect(soundDue(60000, 0, 0, 0)).toBe(false));
