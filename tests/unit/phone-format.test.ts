import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPhone,
  phoneCaret,
  formatPhoneField,
  phoneFieldError,
} from "../../src/lib/phone-format.ts";

test("phones format Brazilian landlines and mobiles, preserving country code and digits", () => {
  for (const [raw, expected] of [
    ["1133334444", "(11) 3333-4444"],
    ["11912345678", "(11) 91234-5678"],
    ["5511912345678", "+55 (11) 91234-5678"],
    ["+55 11 33334444", "+55 (11) 3333-4444"],
    ["55912345678", "(55) 91234-5678"],
    ["33334444", "3333-4444"],
    ["912345678", "91234-5678"],
  ]) {
    assert.equal(formatPhone(raw), expected);
    assert.equal(formatPhone(expected), expected);
    assert.equal(expected.replace(/\D/g, ""), raw.replace(/\D/g, ""));
  }
});
test("partial input gains punctuation without losing digits at any step", () => {
  assert.equal(formatPhone("1", true), "(1");
  assert.equal(formatPhone("11", true), "(11)");
  assert.equal(formatPhone("119", true), "(11) 9");
  assert.equal(formatPhone("1133334", true), "(11) 3333-4");
  for (const number of ["11912345678", "+5511912345678", "+12025550123"]) {
    for (let index = 0; index <= number.length; index++) {
      const raw = number.slice(0, index);
      assert.equal(formatPhone(raw, true).replace(/\D/g, ""), raw.replace(/\D/g, ""));
    }
  }
});
test("international, extended, legacy and empty phone values are preserved appropriately", () => {
  for (const raw of [
    "+1 (202) 555-0123",
    "+351 912 345 678",
    "12345678901234",
    "(11) 3333-4444 ramal 12",
    "1234",
  ])
    assert.equal(formatPhone(raw), raw);
  assert.equal(formatPhone(null), "");
  assert.equal(formatPhone(""), "");
});
test("caret follows the edited digit rather than punctuation", () => {
  assert.equal(phoneCaret("(11) 91234-5678", 3), 6);
  assert.equal(phoneCaret("(11) 91234-5678", 7), 10);
  assert.equal(phoneCaret("+55 (11) 91234-5678", 0), 1);
  assert.equal(phoneCaret("", 0), 0);
});
test("national input masks have separate telephone and WhatsApp groups and limits", () => {
  assert.equal(formatPhoneField("1199999999", "phone"), "(11) 9999-9999");
  assert.equal(formatPhoneField("11999999999", "whatsapp"), "(11) 99999-9999");
  assert.equal(formatPhoneField("1199999999", "whatsapp"), "(11) 99999-999");
  assert.equal(phoneFieldError("(11) 9999-9999", "phone"), null);
  assert.ok(phoneFieldError("(11) 99999-9999", "phone"));
  assert.equal(phoneFieldError("(11) 99999-9999", "whatsapp"), null);
  assert.ok(phoneFieldError("119999999999", "whatsapp"));
  assert.ok(phoneFieldError("+55 11 99999-9999", "whatsapp"));
  assert.equal(formatPhoneField("11999999999", "phone").replace(/\D/g, ""), "11999999999");
  assert.equal(formatPhoneField("33334444 ramal 12", "phone"), "33334444 ramal 12");
});
