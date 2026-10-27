/** Área: Consulta pública de CEP brasileiro e contratos usados no preenchimento do endereço. */
import { z } from "zod";

export type PostalAddress = { address: string; district: string; city: string; state: string };
export type PostalResult = { found: true; address: PostalAddress } | { found: false };
const addressSchema = z.object({
  cep: z.string(),
  logradouro: z.string().max(250).optional().default(""),
  bairro: z.string().max(150).optional().default(""),
  localidade: z.string().trim().min(1).max(150),
  uf: z.enum([
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ]),
});

/** Apresenta o hífen do CEP sem cortar silenciosamente uma entrada acima de oito dígitos. */
export function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length > 8) return value;
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Reconhece a indicação já armazenada de endereço sem número, sem criar coluna no banco. */
export function isNoAddressNumber(value: string | null | undefined) {
  return /^(s\/?n|sem\s+n[uú]mero)$/i.test(value?.trim() ?? "");
}

/** Consulta somente o CEP no ViaCEP, limita a espera e valida os campos devolvidos pelo serviço. */
export async function lookupPostalCode(
  postalCode: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<PostalResult> {
  const digits = postalCode.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) throw new Error("CEP deve conter oito dígitos.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 8_000);
  try {
    const response = await fetcher(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Consulta de CEP indisponível.");
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "erro" in payload &&
      (payload.erro === true || payload.erro === "true")
    )
      return { found: false };
    const result = addressSchema.parse(payload);
    if (result.cep.replace(/\D/g, "") !== digits) throw new Error("CEP diferente do solicitado.");
    return {
      found: true,
      address: {
        address: result.logradouro.trim(),
        district: result.bairro.trim(),
        city: result.localidade,
        state: result.uf,
      },
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
