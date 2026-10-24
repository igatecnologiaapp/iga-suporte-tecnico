import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Toaster } from "sonner";
import { PasswordResetPage } from "../../src/components/iga/PasswordResetPage";
import { createPasswordResetClient } from "../../src/integrations/supabase/password-reset-client";
import { shouldDetectSharedAuthCallback } from "../../src/lib/password-recovery";
const url = "http://127.0.0.1:55421",
  key = "synthetic-public-key";
const main = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    storageKey: "iga-primary-fixture",
    detectSessionInUrl:
      typeof window === "undefined" || shouldDetectSharedAuthCallback(window.location.pathname),
  },
});
const createAuth = () => createPasswordResetClient({ url, key }).auth;
export function Fixture() {
  useEffect(() => {
    void main.auth.getSession().then(({ data }) => {
      document.documentElement.dataset.mainUser = data.session?.user.id || "none";
    });
  }, []);
  return (
    <>
      <PasswordResetPage
        createAuth={createAuth}
        onComplete={() => {
          document.documentElement.dataset.completed = "true";
        }}
      />
      <Toaster />
    </>
  );
}
