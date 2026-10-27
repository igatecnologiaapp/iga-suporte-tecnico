/** Área: Campos cadastrais de empresas, documentos, canais de contato e endereço. */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";
import { PhoneInput } from "./PhoneInput";
import { CompanyAddressFields } from "./CompanyAddressFields";

const sections = [
  {
    title: "Identificação",
    fields: [
      ["legal_name", "Razão Social", true],
      ["trade_name", "Nome Fantasia", true],
      ["tax_id", "CNPJ/CPF", true],
      ["domain", "Domínio (opcional, texto livre)", false],
    ],
  },
  {
    title: "Contato",
    fields: [
      ["phone", "Telefone", false],
      ["whatsapp", "WhatsApp", false],
      ["email", "E-mail", false],
    ],
  },
] as const;

/** Agrupa os campos da empresa e associa o conflito de documento ao campo correspondente. */
export function CompanyFields({
  company,
  taxIdError,
  onTaxIdChange,
  onAddressLookupPending,
}: {
  company: Partial<Tables<"companies">> | null;
  taxIdError?: string | null;
  onTaxIdChange?: () => void;
  onAddressLookupPending?: (pending: boolean) => void;
}) {
  return (
    <>
      {sections.map((section) => (
        <fieldset key={section.title} className="company-fieldset sm:col-span-2">
          <legend>{section.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map(([name, label, required]) => (
              <div key={name} className="min-w-0 space-y-1.5">
                <Label required={required} htmlFor={name}>
                  {label}
                </Label>
                {name === "phone" || name === "whatsapp" ? (
                  <PhoneInput
                    kind={name}
                    id={name}
                    name={name}
                    required={required}
                    defaultValue={company?.[name] ?? ""}
                  />
                ) : (
                  <Input
                    id={name}
                    name={name}
                    type={name === "email" ? "email" : "text"}
                    required={required}
                    defaultValue={company?.[name] ?? ""}
                    aria-invalid={name === "tax_id" && taxIdError ? true : undefined}
                    aria-describedby={
                      name === "domain"
                        ? "domain-help"
                        : name === "tax_id" && taxIdError
                          ? "tax-id-error"
                          : undefined
                    }
                    onChange={name === "tax_id" ? onTaxIdChange : undefined}
                  />
                )}
                {name === "tax_id" && taxIdError && (
                  <p id="tax-id-error" role="alert" className="text-sm text-destructive">
                    {taxIdError}
                  </p>
                )}
                {name === "domain" && (
                  <p id="domain-help" className="text-xs leading-relaxed text-muted-foreground">
                    Informação opcional. Um endereço válido será exibido como link; outros textos
                    serão preservados.
                  </p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <CompanyAddressFields company={company} onLookupPending={onAddressLookupPending} />
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" name="notes" defaultValue={company?.notes ?? ""} />
      </div>
    </>
  );
}
