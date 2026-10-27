import { test } from "node:test";
import assert from "node:assert/strict";
import { preferredContactPhone } from "../../src/lib/contact-phone.ts";

test("contato principal prefere WhatsApp e os demais preferem telefone", () => {
  const numbers = { phone: "1133334444", whatsapp: "11999999999" };
  assert.deepEqual(preferredContactPhone({ ...numbers, is_primary: true }), {
    channel: "whatsapp",
    value: numbers.whatsapp,
  });
  assert.deepEqual(preferredContactPhone({ ...numbers, is_primary: false }), {
    channel: "phone",
    value: numbers.phone,
  });
});
test("canal vazio usa o outro número e ausência de ambos não inventa contato", () => {
  assert.deepEqual(
    preferredContactPhone({ is_primary: true, whatsapp: " ", phone: "1133334444" }),
    { channel: "phone", value: "1133334444" },
  );
  assert.deepEqual(preferredContactPhone({ phone: null, whatsapp: "11999999999" }), {
    channel: "whatsapp",
    value: "11999999999",
  });
  assert.equal(preferredContactPhone({ phone: " ", whatsapp: null }), null);
});
