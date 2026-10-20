import { useState, type FormEvent } from "react";
import { AuthForm } from "./AuthForm";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

export function NewPasswordForm({
  submitPassword,
  onFailure,
}: {
  submitPassword: (password: string) => Promise<void>;
  onFailure: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const password = String(new FormData(event.currentTarget).get("password") || "");
    setBusy(true);
    try {
      await submitPassword(password);
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthForm onSubmit={submit} busy={busy}>
      <h1 className="text-xl font-semibold">Defina uma nova senha</h1>
      <div>
        <Label htmlFor="new-password">Nova senha</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </div>
      <Button className="w-full" disabled={busy}>
        Atualizar senha
      </Button>
    </AuthForm>
  );
}
