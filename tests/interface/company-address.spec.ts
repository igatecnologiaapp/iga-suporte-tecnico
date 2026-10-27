import { expect, test, type Page } from "@playwright/test";

const address = {
  cep: "01001-000",
  logradouro: "Rua Sintética",
  bairro: "Centro Sintético",
  localidade: "Cidade Sintética",
  uf: "SP",
  complemento: "Não substituir unidade do usuário",
};
/** Abre o editor da empresa fictícia utilizada nos cenários de endereço. */
async function openCompany(page: Page) {
  await page.goto("/companies");
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
}
/** Localiza o envio do formulário para conferir espera e persistência. */
const save = (page: Page) => page.getByRole("button", { name: "Salvar alterações", exact: true });

test("CEP completo preenche endereço e salva sem alterar número e complemento", async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ json: address });
  });
  await openCompany(page);
  await page.getByLabel("Número", { exact: true }).fill("123A");
  await page.getByLabel("Complemento (Opcional)", { exact: true }).fill("Sala 7");
  await page.getByLabel("CEP", { exact: true }).fill("01001");
  expect(requested).toEqual([]);
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(page.getByLabel("CEP", { exact: true })).toHaveValue("01001-000");
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Sintética");
  await expect(page.getByLabel("Bairro", { exact: true })).toHaveValue("Centro Sintético");
  await expect(page.getByLabel("Cidade", { exact: true })).toHaveValue("Cidade Sintética");
  await expect(page.getByLabel("UF", { exact: true })).toHaveValue("SP");
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("123A");
  await expect(page.getByLabel("Complemento (Opcional)", { exact: true })).toHaveValue("Sala 7");
  await save(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = await page.evaluate(
    () => window.testDatabase.companies[0] as Record<string, unknown>,
  );
  expect(row["postal_code"]).toBe("01001-000");
  expect(row["address"]).toBe("Rua Sintética");
  expect(row["address_number"]).toBe("123A");
  expect(row["complement"]).toBe("Sala 7");
  expect(requested).toEqual(["https://viacep.com.br/ws/01001000/json/"]);
});

test("busca pendente bloqueia salvar e preserva endereço editado durante a resposta", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    started = true;
    await hold;
    await route.fulfill({ json: address });
  });
  await openCompany(page);
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(save(page)).toBeDisabled();
  await expect.poll(() => started).toBe(true);
  await page.getByLabel("Endereço", { exact: true }).fill("Rua informada manualmente");
  release();
  await expect(save(page)).toBeEnabled();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue(
    "Rua informada manualmente",
  );
  await expect(page.getByLabel("Cidade", { exact: true })).toHaveValue("Cidade Sintética");
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(save(page)).toBeEnabled();
});

test("CEP não encontrado e falha permitem preenchimento manual e nova tentativa", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    calls++;
    if (calls === 1) await route.fulfill({ json: { erro: true } });
    else if (calls === 2) await route.fulfill({ status: 503, body: "" });
    else await route.fulfill({ json: address });
  });
  await openCompany(page);
  await page.getByLabel("Endereço", { exact: true }).fill("Endereço já informado");
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(page.getByRole("status")).toContainText("CEP não encontrado");
  await expect(save(page)).toBeEnabled();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Endereço já informado");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Não foi possível consultar");
  await expect(save(page)).toBeEnabled();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Sintética");
});

test("resposta de CEP antigo ou apagado não substitui o endereço atual", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    if (route.request().url().includes("01001000")) {
      started = true;
      await hold;
      await route.fulfill({ json: address }).catch(() => {});
    } else await route.fulfill({ json: { ...address, cep: "02002-000", logradouro: "Rua Nova" } });
  });
  await openCompany(page);
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect.poll(() => started).toBe(true);
  await page.getByLabel("CEP", { exact: true }).fill("02002000");
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Nova");
  release();
  await expect(save(page)).toBeEnabled();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Nova");
  await page.getByLabel("CEP", { exact: true }).clear();
  await expect(save(page)).toBeEnabled();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Nova");
});

test("Sem número persiste S/N, restaura a escolha ao editar e permite voltar ao número anterior", async ({
  page,
}) => {
  await openCompany(page);
  const number = page.getByLabel("Número", { exact: true });
  await number.fill("42");
  await page.getByLabel("Sem número", { exact: true }).check();
  await expect(number).toBeDisabled();
  await page.getByLabel("Sem número", { exact: true }).uncheck();
  await expect(number).toHaveValue("42");
  await page.getByLabel("Sem número", { exact: true }).check();
  await save(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window.testDatabase.companies[0] as Record<string, unknown>)["address_number"],
    ),
  ).toBe("S/N");
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
  await expect(page.getByLabel("Sem número", { exact: true })).toBeChecked();
  await page.getByLabel("Sem número", { exact: true }).uncheck();
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("");
});

test("cancelar durante a consulta libera o próximo editor sem aplicar a resposta antiga", async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    started = true;
    await hold;
    await route.fulfill({ json: address }).catch(() => {});
  });
  await openCompany(page);
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
  await expect(save(page)).toBeEnabled();
  release();
  await expect(page.getByLabel("CEP", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("");
});

test("abrir CEP já cadastrado não consulta nem sobrescreve endereço e CEP geral pede preenchimento", async ({
  page,
}) => {
  await openCompany(page);
  await page.getByLabel("Endereço", { exact: true }).fill("Rua existente");
  let calls = 0;
  await page.route("https://viacep.com.br/ws/**/json/", async (route) => {
    calls++;
    await route.fulfill({ json: { ...address, logradouro: "", bairro: "" } });
  });
  await page.getByLabel("CEP", { exact: true }).fill("123456789");
  await expect(page.getByRole("status")).toContainText("oito dígitos");
  expect(calls).toBe(0);
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(page.getByRole("status")).toContainText("Complete os campos");
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("");
  await page.getByLabel("Endereço", { exact: true }).fill("Endereço manual");
  await save(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
  await expect(page.getByLabel("Endereço", { exact: true })).toHaveValue("Endereço manual");
  expect(calls).toBe(1);
});
