import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPostalCode,
  isNoAddressNumber,
  lookupPostalCode,
} from "../../src/lib/postal-code.ts";

const response = {
  cep: "01001-000",
  logradouro: "Rua Sintética",
  bairro: "Centro",
  localidade: "Cidade Sintética",
  uf: "SP",
};

test("CEP ganha hífen sem truncar valores maiores e S/N reconhece registros existentes", () => {
  assert.equal(formatPostalCode("01001000"), "01001-000");
  assert.equal(formatPostalCode("03804"), "03804");
  assert.equal(formatPostalCode("123456789"), "123456789");
  for (const value of ["S/N", "s/n", "Sem número", "sem numero"])
    assert.equal(isNoAddressNumber(value), true);
  for (const value of ["123A", "0", "", null]) assert.equal(isNoAddressNumber(value), false);
});

test("consulta envia somente CEP ao endereço fixo e converte campos permitidos", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://viacep.com.br/ws/01001000/json/");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.referrerPolicy, "no-referrer");
    assert.equal(options?.headers, undefined);
    assert.equal(options?.body, undefined);
    return Response.json({
      ...response,
      complemento: "Não usar como complemento do imóvel",
      ibge: "ignore",
    });
  };
  assert.deepEqual(await lookupPostalCode("01001-000", undefined, fetcher), {
    found: true,
    address: {
      address: "Rua Sintética",
      district: "Centro",
      city: "Cidade Sintética",
      state: "SP",
    },
  });
});

test("CEP geral pode omitir logradouro e bairro, mas cidade UF e CEP precisam ser válidos", async () => {
  assert.deepEqual(
    await lookupPostalCode("01001000", undefined, async () =>
      Response.json({ ...response, logradouro: "", bairro: "" }),
    ),
    { found: true, address: { address: "", district: "", city: "Cidade Sintética", state: "SP" } },
  );
  for (const body of [
    { ...response, cep: "99999-999" },
    { ...response, uf: "XX" },
    { ...response, localidade: "" },
    {},
  ])
    await assert.rejects(lookupPostalCode("01001000", undefined, async () => Response.json(body)));
});

test("CEP ausente e falha HTTP têm resultados distintos e entrada inválida não faz consulta", async () => {
  assert.deepEqual(
    await lookupPostalCode("01001000", undefined, async () => Response.json({ erro: true })),
    { found: false },
  );
  await assert.rejects(
    lookupPostalCode("01001000", undefined, async () => new Response("", { status: 503 })),
  );
  let calls = 0;
  await assert.rejects(
    lookupPostalCode("../123", undefined, async () => {
      calls++;
      return Response.json(response);
    }),
  );
  assert.equal(calls, 0);
});

test("consulta respeita cancelamento do editor e limite de oito segundos", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetcher: typeof fetch = async (_url, options) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) reject(new Error("Cancelado"));
      signal?.addEventListener("abort", () => reject(new Error("Cancelado")), { once: true });
    });
  const pending = lookupPostalCode("01001000", undefined, fetcher);
  const checked = assert.rejects(pending);
  t.mock.timers.tick(8_000);
  await checked;
  const controller = new AbortController();
  const canceled = assert.rejects(lookupPostalCode("01001000", controller.signal, fetcher));
  controller.abort();
  await canceled;
});
