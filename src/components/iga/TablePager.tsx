import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { DEFAULT_PAGE_SIZE, pageRange } from "../../lib/list-pagination";
export function TablePager({
  total,
  page,
  busy = false,
  label,
  onPage,
}: {
  total: number;
  page: number;
  busy?: boolean;
  label: string;
  onPage: (page: number) => void;
}) {
  const range = pageRange(total, page, DEFAULT_PAGE_SIZE);
  return (
    <nav className="table-pager" aria-label={`Paginação de ${label}`}>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {busy
          ? "Carregando registros…"
          : `Mostrando ${range.start} a ${range.end} de ${total} registros`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Página anterior"
          disabled={busy || range.page <= 1}
          onClick={() => onPage(range.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span
          className="table-page-number"
          aria-current="page"
          aria-label={`Página ${range.page} de ${range.pages}`}
        >
          {range.page}
          <span className="sr-only"> de {range.pages}</span>
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Próxima página"
          disabled={busy || range.page >= range.pages}
          onClick={() => onPage(range.page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
