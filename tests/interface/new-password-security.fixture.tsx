import { NewPasswordForm } from "../../src/components/iga/NewPasswordForm";
export function Fixture() {
  return (
    <NewPasswordForm
      submitPassword={async () => {
        if (document.documentElement.dataset.reject === "true") throw new Error("synthetic");
        document.documentElement.dataset.submitted = "true";
      }}
      onFailure={() => {
        document.documentElement.dataset.failed = "true";
      }}
    />
  );
}
