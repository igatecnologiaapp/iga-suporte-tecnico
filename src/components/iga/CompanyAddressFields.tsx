/** Área: Endereço da empresa, preenchimento por CEP e indicação de endereço sem número. */
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { Tables } from "../../integrations/supabase/types";
import {
  formatPostalCode,
  isNoAddressNumber,
  lookupPostalCode,
  type PostalAddress,
} from "../../lib/postal-code";

type Draft = PostalAddress & { postal_code: string; address_number: string; complement: string };
type LookupState = "idle" | "pending" | "found" | "partial" | "not_found" | "error";
const labels = [
  ["address", "Endereço", "address-line1"],
  ["district", "Bairro", "address-level3"],
  ["city", "Cidade", "address-level2"],
  ["state", "UF", "address-level1"],
] as const;

/** Mantém os dados manuais e aplica somente a resposta correspondente ao CEP atual. */
export function CompanyAddressFields({
  company,
  onLookupPending,
}: {
  company: Partial<Tables<"companies">> | null;
  onLookupPending?: ((pending: boolean) => void) | undefined;
}) {
  const [withoutNumber, setWithoutNumber] = useState(() =>
    isNoAddressNumber(company?.address_number),
  );
  const [fields, setFields] = useState<Draft>(() => ({
    postal_code: formatPostalCode(company?.postal_code ?? ""),
    address: company?.address ?? "",
    district: company?.district ?? "",
    city: company?.city ?? "",
    state: company?.state ?? "",
    address_number: isNoAddressNumber(company?.address_number)
      ? ""
      : (company?.address_number ?? ""),
    complement: company?.complement ?? "",
  }));
  const [query, setQuery] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<LookupState>("idle");
  const latestPostal = useRef<string | null>(null);
  const revisions = useRef({ address: 0, district: 0, city: 0, state: 0 });

  /** Registra edição manual para que uma consulta em andamento não a sobrescreva. */
  function changeField(name: keyof Draft, value: string) {
    if (name === "address" || name === "district" || name === "city" || name === "state")
      revisions.current[name]++;
    setFields((previous) => ({ ...previous, [name]: value }));
  }

  /** Inicia consulta apenas após edição explícita do CEP e oito dígitos completos. */
  function changePostalCode(value: string) {
    const digits = value.replace(/\D/g, "");
    latestPostal.current = digits;
    setFields((previous) => ({ ...previous, postal_code: formatPostalCode(value) }));
    if (query !== digits) {
      setQuery(digits);
      onLookupPending?.(digits.length === 8);
    }
  }

  useEffect(() => {
    if (!query || query.length !== 8) {
      setLookup("idle");
      onLookupPending?.(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const baseline = { ...revisions.current };
    setLookup("pending");
    onLookupPending?.(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await lookupPostalCode(query, controller.signal);
        if (!active || latestPostal.current !== query) return;
        if (!result.found) {
          setLookup("not_found");
          return;
        }
        setFields((current) => {
          if (current.postal_code.replace(/\D/g, "") !== query) return current;
          const next = { ...current };
          for (const [name] of labels)
            if (revisions.current[name] === baseline[name]) next[name] = result.address[name];
          return next;
        });
        setLookup(result.address.address && result.address.district ? "found" : "partial");
      } catch {
        if (active && latestPostal.current === query) setLookup("error");
      } finally {
        if (active && latestPostal.current === query) onLookupPending?.(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
      onLookupPending?.(false);
    };
  }, [query, attempt, onLookupPending]);

  /** Repete a consulta atual após falha, mantendo os campos já preenchidos. */
  function retryLookup() {
    onLookupPending?.(true);
    setAttempt((previous) => previous + 1);
  }
  const messages: Record<LookupState, string> = {
    idle: "",
    pending: "Consultando CEP…",
    found: "CEP encontrado. Confira o endereço preenchido.",
    partial: "CEP encontrado. Complete os campos de endereço que ficaram em branco.",
    not_found: "CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.",
    error: "Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.",
  };
  const invalid = fields.postal_code.replace(/\D/g, "").length > 8;
  return (
    <fieldset className="company-fieldset sm:col-span-2">
      <legend>Endereço</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="postal_code">CEP</Label>
          <Input
            id="postal_code"
            name="postal_code"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={fields.postal_code}
            aria-invalid={invalid || undefined}
            aria-describedby="postal-code-status"
            onChange={(event) => changePostalCode(event.target.value)}
          />
          <p
            id="postal-code-status"
            role="status"
            className={`text-xs leading-relaxed ${invalid || lookup === "not_found" || lookup === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {invalid ? "Informe um CEP com oito dígitos." : messages[lookup]}
          </p>
          {(lookup === "error" || lookup === "not_found") && (
            <Button type="button" size="sm" variant="outline" onClick={retryLookup}>
              Tentar novamente
            </Button>
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="address">Endereço</Label>
          <Input
            id="address"
            name="address"
            autoComplete="address-line1"
            value={fields.address}
            onChange={(event) => changeField("address", event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="address_number">Número</Label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={withoutNumber}
                onChange={(event) => setWithoutNumber(event.target.checked)}
              />
              Sem número
            </label>
          </div>
          <Input
            id="address_number"
            name="address_number"
            value={withoutNumber ? "S/N" : fields.address_number}
            disabled={withoutNumber}
            onChange={(event) => changeField("address_number", event.target.value)}
          />
          {/* O campo desabilitado fica fora do FormData; o oculto preserva S/N no envio. */}
          {withoutNumber && <input type="hidden" name="address_number" value="S/N" />}
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="complement">Complemento (Opcional)</Label>
          <Input
            id="complement"
            name="complement"
            value={fields.complement}
            onChange={(event) => changeField("complement", event.target.value)}
          />
        </div>
        {labels.slice(1).map(([name, label, autoComplete]) => (
          <div key={name} className="min-w-0 space-y-1.5">
            <Label htmlFor={name}>{label}</Label>
            <Input
              id={name}
              name={name}
              autoComplete={autoComplete}
              maxLength={name === "state" ? 2 : undefined}
              value={fields[name]}
              onChange={(event) => changeField(name, event.target.value)}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
