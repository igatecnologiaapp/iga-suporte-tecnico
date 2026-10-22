import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getFirstResponseAlerts } from '@/lib/first-response.functions';
import { RESPONSE_POLL_MS, soundDue, type ResponsePending } from '@/lib/first-response';
import { formatDuration, priorityLabels } from '@/lib/iga';

export function FirstResponseAlert({ userId, operational, onRows }: { userId: string; operational: boolean; onRows: (rows: ResponsePending[]) => void }) {
  const fetchAlerts = useServerFn(getFirstResponseAlerts);
  const [rows, setRows] = useState<ResponsePending[]>([]);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const pending = useRef<ResponsePending[]>([]);
  const preferences = useRef({ enabled: false, mutedUntil: 0 });
  const last = useRef(0);
  const offset = useRef(0);
  const connectionFailed = useRef(false);
  const key = `iga-response-sound:${userId}`;
  async function beep() {
    const ctx = audio.current;
    if (!ctx) return false;
    try {
      await ctx.resume();
      if (ctx.state !== 'running') throw new Error('blocked');
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(); oscillator.stop(ctx.currentTime + 0.4);
      return true;
    } catch { preferences.current.enabled = false; setEnabled(false); setAudioError(true); return false; }
  }
  useEffect(() => {
    let active = true; let loading = false;
    async function load() {
      if (loading) return; loading = true;
      try {
        const result = await fetchAlerts();
        if (!active) return;
        offset.current = Date.parse(result.serverNow) - Date.now();
        pending.current = result.rows; setRows(result.rows); onRows(result.rows); setFailed(false); connectionFailed.current = false;
      } catch { if (active) { setFailed(true); connectionFailed.current = true; } }
      finally { loading = false; }
    }
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    void load(); const poll = setInterval(refresh, RESPONSE_POLL_MS);
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(poll); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); onRows([]); };
  }, [onRows]);
  useEffect(() => {
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time + offset.current);
      if (!operational || connectionFailed.current || document.visibilityState !== 'visible' || !preferences.current.enabled
        || !soundDue(time, last.current, pending.current.length, preferences.current.mutedUntil)) return;
      if (!navigator.locks) { preferences.current.enabled = false; setEnabled(false); setAudioError(true); return; }
      void navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) return;
        let previous = 0;
        try { previous = Number(localStorage.getItem(key) || 0); } catch { preferences.current.enabled = false; setEnabled(false); setAudioError(true); return; }
        if (!soundDue(time, previous, pending.current.length, preferences.current.mutedUntil)) return;
        if (await beep()) { last.current = time; try { localStorage.setItem(key, String(time)); } catch { preferences.current.enabled = false; setEnabled(false); setAudioError(true); } }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [key, operational]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  async function activate() {
    try {
      if (!navigator.locks) throw new Error('unsupported');
      audio.current ??= new AudioContext();
      // Initial user gesture also uses the cross-tab lock to prevent overlapping tests.
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('busy');
        const previous = Number(localStorage.getItem(key) || 0);
        await audio.current?.resume();
        if (audio.current?.state !== 'running') throw new Error('blocked');
        if (Date.now() - previous > 1000 && !await beep()) return;
        preferences.current = { enabled: true, mutedUntil: 0 }; setEnabled(true); setMutedUntil(0); setAudioError(false);
        last.current = Date.now(); localStorage.setItem(key, String(last.current));
      });
    } catch { setEnabled(false); setAudioError(true); preferences.current.enabled = false; }
  }
  if (!operational) return null;
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {failed && <span role="status" className="text-xs text-muted-foreground">Alertas sem atualização · reconectando</span>}
    {rows.length > 0 && <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-auto min-h-9 max-w-full border-destructive/40 bg-destructive/10 text-destructive whitespace-normal"><AlertTriangle className="shrink-0" /><span>ATENÇÃO — {rows.length} {rows.length === 1 ? 'chamado aguardando resposta' : 'chamados aguardando resposta'}</span></Button></PopoverTrigger><PopoverContent className="w-80 max-w-[calc(100vw-2rem)]"><p className="mb-2 text-sm font-semibold">Há mais de 3 minutos sem primeira resposta</p><PendingResponseList rows={rows} now={now} /></PopoverContent></Popover>}
    {!enabled ? <Button variant="ghost" size="sm" onClick={() => void activate()}><Volume2 />Ativar alertas sonoros</Button> : <>
      <Button variant="ghost" size="icon" aria-label="Desativar alertas sonoros" title="Desativar alertas sonoros" onClick={() => { preferences.current.enabled = false; setEnabled(false); }}><VolumeX /></Button>
      <Button variant="ghost" size="sm" onClick={() => { const until = mutedUntil > Date.now() ? 0 : Date.now() + 300_000; preferences.current.mutedUntil = until; setMutedUntil(until); }}>{mutedUntil > Date.now() ? 'Retomar som' : 'Silenciar por 5 min'}</Button>
    </>}
    {audioError && <span role="status" className="text-xs text-muted-foreground">Som indisponível. Tente ativar novamente neste navegador.</span>}
  </div>;
}
export function PendingResponseList({ rows, now = Date.now() }: { rows: ResponsePending[]; now?: number }) {
  return <div className="max-h-80 divide-y overflow-y-auto">{rows.map(row => <Link key={row.id} to="/tickets/$ticketId" params={{ ticketId: row.id }} className="block py-3 text-sm hover:bg-muted/50"><p className="font-semibold text-primary">{row.number} · {row.company || 'Empresa'}</p><p className="break-words">{row.subject}</p><p className="text-xs text-muted-foreground">{priorityLabels[row.priority]} · {formatDuration(row.opened_at, now)} de espera</p></Link>)}</div>;
}
