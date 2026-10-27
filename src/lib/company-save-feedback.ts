/** Área: Reconhecimento do conflito específico de CNPJ/CPF para orientação junto ao campo. */
/** Match only the existing document constraint, never another unique field. */
export function isCompanyTaxIdConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (
    "code" in error &&
    error.code === "23505" &&
    "message" in error &&
    typeof error.message === "string" &&
    /"companies_tax_id_key"/.test(error.message)
  );
}

export const companyTaxIdConflictMessage =
  "Este CNPJ/CPF já está cadastrado em outra empresa, que pode estar arquivada. Confira o documento ou consulte os cadastros existentes.";
