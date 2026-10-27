/** Área: Escolha do canal exibido conforme a preferência do contato. */
type ContactNumbers = {
  phone?: string | null;
  whatsapp?: string | null;
  is_primary?: boolean | null;
};

/** Escolhe WhatsApp para contato principal e telefone para os demais, com alternativa se vazio. */
export function preferredContactPhone(contact: ContactNumbers) {
  const choices = contact.is_primary
    ? ([
        ["whatsapp", contact.whatsapp],
        ["phone", contact.phone],
      ] as const)
    : ([
        ["phone", contact.phone],
        ["whatsapp", contact.whatsapp],
      ] as const);
  for (const [channel, value] of choices)
    if (value?.trim()) return { channel, value: value.trim() };
  return null;
}
