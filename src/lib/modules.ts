export const MODULES = [
  { key: "inbox", label: "Caixa de Entrada / WhatsApp", path: "/inbox" },
  { key: "tickets", label: "Chamados", path: "/tickets" },
  { key: "companies", label: "Empresas / Clientes", path: "/companies" },
  { key: "contacts", label: "Contatos", path: "/contacts" },
  { key: "categories", label: "Categorias de Chamados", path: "/categories" },
  { key: "sla", label: "SLA", path: "/sla" },
  { key: "technicians", label: "Técnicos", path: "/technicians" },
  { key: "users", label: "Usuários", path: "/users" },
  { key: "integrations", label: "Integrações", path: "/integrations" },
  { key: "settings", label: "Configurações", path: "/settings" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export const MODULE_KEYS = MODULES.map(m => m.key) as ModuleKey[];

export function moduleForPath(pathname: string): ModuleKey | null {
  return MODULES.find(m => pathname === m.path || pathname.startsWith(m.path + "/"))?.key ?? null;
}
