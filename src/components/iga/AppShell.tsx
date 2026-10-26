import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Contact,
  Inbox,
  Menu,
  Moon,
  PlugZap,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/iga/NotificationsBell";
import { LogoutButton } from "@/components/iga/LogoutButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { moduleForPath, MODULES } from "@/lib/modules";

const groups = [
  {
    label: "OPERAÇÃO",
    items: [
      ["Caixa de Entrada", "/inbox", Inbox],
      ["Chamados", "/tickets", ClipboardList],
    ],
  },
  {
    label: "CADASTROS",
    items: [
      ["Empresas / Clientes", "/companies", Building2],
      ["Contatos", "/contacts", Contact],
      ["Categorias de Chamados", "/categories", Tags],
    ],
  },
  { label: "GESTÃO", items: [["SLA", "/sla", ShieldCheck]] },
  {
    label: "ADMINISTRAÇÃO",
    items: [
      ["Usuários", "/users", Users],
      ["Técnicos", "/technicians", Wrench],
      ["Integrações", "/integrations", PlugZap],
      ["Configurações", "/settings", Settings],
    ],
  },
] as const;

const OPEN_KEY = "iga-menu-groups";

export function AppShell({
  children,
  userName,
  role,
  modules,
}: {
  children: ReactNode;
  userName: string;
  role: string;
  modules: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: (g.items as readonly (readonly [string, string, typeof Inbox])[]).filter(([, to]) => {
        const m = moduleForPath(to);
        return !m || modules.includes(m);
      }),
    }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    const saved = localStorage.getItem("iga-theme");
    const d = saved === "dark";
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    let stored: string[] = [];
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (Array.isArray(value))
          stored = value.filter((item): item is string => typeof item === "string");
      }
    } catch {
      stored = [];
    }
    const current = groups.find((g) => g.items.some(([, to]) => path.startsWith(to)))?.label;
    setOpenGroups(current && !stored.includes(current) ? [...stored, current] : stored);
  }, [path]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      return next;
    });
  }
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("iga-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await navigate({ to: "/auth", replace: true });
  }

  const currentModule = MODULES.find((module) => module.key === moduleForPath(path));
  function navigation(compact: boolean) {
    return (
      <>
        {" "}
        <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-4">
          <Link to="/tickets" className="flex min-w-0 items-center gap-3">
            <span className="brand-monogram">IGA</span>
            {!compact && (
              <span className="min-w-0">
                <b className="block truncate">IGA Service</b>
                <small className="block truncate text-muted-foreground">Atendimento técnico</small>
              </span>
            )}
          </Link>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group) => {
            const expanded = openGroups.includes(group.label);
            const hasCurrent = group.items.some(([, to]) => path.startsWith(to));
            return (
              <div key={group.label} className="mb-2">
                {!compact && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-md px-3 text-[11px] font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      expanded || hasCurrent
                        ? "text-sidebar-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
                {(compact || expanded) && (
                  <div className="mt-1 space-y-1">
                    {group.items.map(([label, to, Icon]) => (
                      <Tooltip key={to}>
                        <TooltipTrigger asChild>
                          <Link
                            to={to}
                            aria-current={path.startsWith(to) ? "page" : undefined}
                            onClick={() => setMobile(false)}
                            className={cn(
                              "nav-item",
                              path.startsWith(to)
                                ? "nav-item-active"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              compact ? "justify-center px-0" : "ml-2",
                            )}
                          >
                            <Icon className="size-4 shrink-0" />
                            {compact ? (
                              <span className="sr-only">{label}</span>
                            ) : (
                              <span className="truncate">{label}</span>
                            )}
                          </Link>
                        </TooltipTrigger>
                        {compact && <TooltipContent side="right">{label}</TooltipContent>}
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div
            className={cn(
              "mb-2 flex items-center gap-3 rounded-md bg-muted p-2",
              compact && "justify-center",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {userName.slice(0, 2).toUpperCase()}
            </span>
            {!compact && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{role}</p>
              </div>
            )}
          </div>
          <LogoutButton compact={compact} onConfirm={logout} />
        </div>
      </>
    );
  }
  return (
    <TooltipProvider>
      <div className="app-surface min-h-screen text-foreground">
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar md:flex",
            collapsed ? "w-20" : "w-64",
          )}
        >
          {navigation(collapsed)}
        </aside>
        <div className={cn("min-w-0 transition-[padding]", collapsed ? "md:pl-20" : "md:pl-64")}>
          <header className="shell-header sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-xl md:h-20 md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobile} onOpenChange={setMobile}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="ghost" className="md:hidden" aria-label="Abrir menu">
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-[min(19rem,88vw)] flex-col gap-0 bg-sidebar p-0"
                >
                  <SheetTitle className="sr-only">Menu IGA Service</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navegue pelos módulos disponíveis para seu usuário.
                  </SheetDescription>
                  {navigation(false)}
                </SheetContent>
              </Sheet>
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              >
                {collapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {currentModule?.label ?? "IGA Service"}
                </p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Organização para cuidar de cada atendimento
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <NotificationsBell />
              <span aria-hidden="true" className="mx-1 h-5 border-l" />
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleTheme}
                aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto min-w-0 max-w-[1600px] p-4 outline-none md:p-7 lg:p-8"
          >
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
