import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronLeft, ChevronRight, ClipboardList, Contact, LogOut, Menu, Moon, Settings, ShieldCheck, Sun, Tags, UserCog, Users, Wrench, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const groups = [
  { label: "OPERAÇÃO", items: [["Chamados","/tickets",ClipboardList]] },
  { label: "CADASTROS", items: [["Empresas / Clientes","/companies",Building2],["Contatos","/contacts",Contact],["Técnicos","/technicians",Wrench],["Categorias de Chamados","/categories",Tags]] },
  { label: "GESTÃO", items: [["SLA","/sla",ShieldCheck]] },
  { label: "ADMINISTRAÇÃO", items: [["Usuários","/users",Users],["Configurações","/settings",Settings]] },
] as const;
export function AppShell({ children, userName, role }: { children: ReactNode; userName: string; role: string }) {
  const [collapsed,setCollapsed] = useState(false); const [mobile,setMobile] = useState(false); const [dark,setDark] = useState(false);
  const path = useRouterState({ select: s => s.location.pathname }); const navigate = useNavigate();
  useEffect(() => { const saved=localStorage.getItem("iga-theme"); const d=saved === "dark"; setDark(d); document.documentElement.classList.toggle("dark",d); },[]);
  function toggleTheme(){ const next=!dark; setDark(next); localStorage.setItem("iga-theme",next?"dark":"light"); document.documentElement.classList.toggle("dark",next); }
  async function logout(){ await supabase.auth.signOut(); navigate({to:"/auth",replace:true}); }
  return <TooltipProvider><div className="min-h-screen bg-background text-foreground">
    {mobile && <button aria-label="Fechar menu" className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={()=>setMobile(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all",collapsed?"w-18":"w-64",mobile?"translate-x-0":"-translate-x-full md:translate-x-0")}>
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4"><Link to="/tickets" className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">IGA</span>{!collapsed&&<span className="min-w-0"><b className="block truncate">IGA Service</b><small className="block truncate text-muted-foreground">Atendimento técnico</small></span>}</Link><Button className="md:hidden" size="icon" variant="ghost" onClick={()=>setMobile(false)} aria-label="Fechar"><X/></Button></div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">{groups.map(g=><div key={g.label} className="mb-5">{!collapsed&&<p className="mb-2 px-3 text-[11px] font-semibold text-muted-foreground">{g.label}</p>}<div className="space-y-1">{g.items.map(([label,to,Icon])=><Tooltip key={to}><TooltipTrigger asChild><Link to={to} onClick={()=>setMobile(false)} className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",path.startsWith(to)?"bg-sidebar-accent text-sidebar-accent-foreground":"text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",collapsed&&"justify-center px-0")}><Icon className="size-4 shrink-0"/>{!collapsed&&<span className="truncate">{label}</span>}</Link></TooltipTrigger>{collapsed&&<TooltipContent side="right">{label}</TooltipContent>}</Tooltip>)}</div></div>)}</nav>
      <div className="border-t border-sidebar-border p-3"><div className={cn("mb-2 flex items-center gap-3 rounded-md bg-muted p-2",collapsed&&"justify-center")}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{userName.slice(0,2).toUpperCase()}</span>{!collapsed&&<div className="min-w-0"><p className="truncate text-sm font-medium">{userName}</p><p className="truncate text-xs text-muted-foreground">{role}</p></div>}</div><Button variant="ghost" className={cn("w-full",collapsed?"px-0":"justify-start")} onClick={logout}><LogOut/>{!collapsed&&"Sair"}</Button></div>
    </aside>
    <div className={cn("transition-all",collapsed?"md:pl-18":"md:pl-64")}><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6"><div className="flex items-center gap-2"><Button size="icon" variant="ghost" className="md:hidden" onClick={()=>setMobile(true)} aria-label="Abrir menu"><Menu/></Button><Button size="icon" variant="ghost" className="hidden md:inline-flex" onClick={()=>setCollapsed(!collapsed)} aria-label="Recolher menu">{collapsed?<ChevronRight/>:<ChevronLeft/>}</Button></div><Button size="icon" variant="ghost" onClick={toggleTheme} aria-label="Alternar tema">{dark?<Sun/>:<Moon/>}</Button></header><main className="mx-auto max-w-[1600px] p-4 md:p-6">{children}</main></div>
  </div></TooltipProvider>;
}
