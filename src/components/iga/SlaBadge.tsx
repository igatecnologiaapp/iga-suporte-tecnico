import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SlaInfo } from "@/lib/sla";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  ok: "border-transparent bg-primary/10 text-primary",
  warning: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  breached: "border-transparent bg-destructive/15 text-destructive",
  done_ok: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  done_late: "border-transparent bg-destructive/10 text-destructive",
  none: "text-muted-foreground",
};

export function SlaBadge({ sla }: { sla: SlaInfo }) {
  return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className={cn("font-medium", tone[sla.state])}>{sla.label}</Badge></TooltipTrigger><TooltipContent>{sla.detail}</TooltipContent></Tooltip>;
}
