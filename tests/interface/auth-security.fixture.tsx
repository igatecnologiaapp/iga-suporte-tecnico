import { AuthForm } from "../../src/components/iga/AuthForm";

export function Fixture() {
  return (
    <AuthForm
      onSubmit={(event) => {
        event.preventDefault();
        document.documentElement.dataset.submitted = "true";
      }}
    >
      <input name="email" type="email" aria-label="Email" required />
      <input name="password" type="password" aria-label="Password" required />
      <button type="submit">Entrar</button>
    </AuthForm>
  );
}
