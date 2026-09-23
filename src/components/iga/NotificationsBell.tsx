import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, notificationLabels } from "@/lib/iga";
import { supabase } from "@/integrations/supabase/client";

type Notification = { id: string; title: string; body: string | null; event_type: string; read_at: string | null; created_at: string };

export function NotificationsBell() {
  const [rows, setRows] = useState<Notification[]>([]);
  async function load() {
    const { data } = await supabase.from("notifications").select("id,title,body,event_type,read_at,created_at").order("created_at", { ascending: false }).limit(30);
    setRows((data ?? []) as Notification[]);
  }
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60_000); return () => clearInterval(timer); }, []);
  const unread = rows.filter(r => !r.read_at).length;
  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() } as never).in("id", ids);
    if (error) { toast.error(error.message); return; }
    await load();
  }
  return <Popover><PopoverTrigger asChild>
    <Button size="icon" variant="ghost" aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`} className="relative">
      <Bell />{unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{unread}</span>}
    </Button>
  </PopoverTrigger><PopoverContent align="end" className="w-80 p-0">
    <div className="flex items-center justify-between border-b px-4 py-3"><p className="text-sm font-semibold">Notificações</p>{unread > 0 && <Button size="sm" variant="ghost" onClick={() => void markRead(rows.filter(r => !r.read_at).map(r => r.id))}>Marcar todas</Button>}</div>
    <div className="max-h-80 divide-y overflow-y-auto">
      {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</p> : rows.map(r =>
        <button key={r.id} type="button" onClick={() => void markRead([r.id])} className="block w-full px-4 py-3 text-left hover:bg-muted/50">
          <p className="flex items-center gap-2 text-sm font-medium">{!r.read_at && <span className="size-2 shrink-0 rounded-full bg-primary" />}{r.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{notificationLabels[r.event_type] ?? r.event_type} · {formatDate(r.created_at)}</p>
          {r.body && <p className="mt-1 text-xs text-muted-foreground">{r.body}</p>}
        </button>)}
    </div>
  </PopoverContent></Popover>;
}
