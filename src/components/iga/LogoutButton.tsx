import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "../ui/alert-dialog";

export function LogoutButton({
  compact,
  onConfirm,
}: {
  compact: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      toast.error("Não foi possível sair da conta. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:ring-destructive ${compact ? "px-0" : "justify-start"}`}
          aria-label="Sair da conta"
        >
          <LogOut />
          {!compact && "Sair"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="max-h-[90vh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-lg"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
          <AlertDialogDescription>
            Você precisará entrar novamente para continuar o atendimento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0" disabled={busy}>
            Cancelar
          </AlertDialogCancel>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy ? "Saindo…" : "Sair"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
