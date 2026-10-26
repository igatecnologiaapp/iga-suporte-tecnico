import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { INBOX_UNREAD_CHANGED } from "@/lib/inbox-unread";

export function useInboxUnread(enabled: boolean) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(0);
    if (!enabled) return;
    let active = true;
    let running = false;
    let refreshAgain = false;
    async function refresh() {
      if (!active || document.visibilityState !== "visible") return;
      if (running) {
        refreshAgain = true;
        return;
      }
      running = true;
      try {
        let count = 0;
        // Read only unread metadata, in bounded batches, respecting the caller's RLS.
        // Do not truncate the total at the API's per-response row limit.
        const batch = 500;
        for (let offset = 0; active; offset += batch) {
          const { data, error } = await supabase
            .from("conversations")
            .select("unread_count")
            .gt("unread_count", 0)
            .order("id")
            .range(offset, offset + batch - 1);
          if (error || !data) throw new Error("Contagem indisponível.");
          for (const row of data) count += Math.max(0, row.unread_count ?? 0);
          if (data.length < batch) break;
        }
        if (active) setTotal(count);
      } catch {
        // Preserve the last successful total; do not claim messages were read.
      } finally {
        running = false;
        if (active && refreshAgain) {
          refreshAgain = false;
          void refresh();
        }
      }
    }
    const onRefresh = () => void refresh();
    void refresh();
    const timer = window.setInterval(onRefresh, 10_000);
    window.addEventListener(INBOX_UNREAD_CHANGED, onRefresh);
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(INBOX_UNREAD_CHANGED, onRefresh);
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [enabled]);
  return enabled ? total : 0;
}
