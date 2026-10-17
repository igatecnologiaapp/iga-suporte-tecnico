import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

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
  {
    title: "Endereço",
    fields: [
      ["postal_code", "CEP", false],
      ["address", "Endereço", false],
      ["address_number", "Número", false],
      ["complement", "Complemento", false],
      ["district", "Bairro", false],
      ["city", "Cidade", false],
      ["state", "UF", false],
    ],
  },
] as const;

export function CompanyFields({ company }: { company: Partial<Tables<"companies">> | null }) {
  return (
    <>
      {sections.map((section) => (
        <fieldset key={section.title} className="company-fieldset sm:col-span-2">
          <legend>{section.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map(([name, label, required]) => (
              <div key={name} className="min-w-0 space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  name={name}
                  type={name === "email" ? "email" : "text"}
                  required={required}
                  defaultValue={company?.[name] ?? ""}
                  aria-describedby={name === "domain" ? "domain-help" : undefined}
                />
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
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" name="notes" defaultValue={company?.notes ?? ""} />
      </div>
    </>
  );
}
