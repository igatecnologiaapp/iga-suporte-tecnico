import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "../../src/components/iga/AppShell";
import { TicketsPage } from "../../src/routes/_authenticated/tickets.index";
import { ResourcePage } from "../../src/components/iga/ResourcePage";
import "../../src/styles.css";
const root = createRootRoute({ component: Harness });
const routes = ["/companies", "/contacts", "/categories", "/technicians", "/tickets", "/auth"].map(
  (path) => createRoute({ getParentRoute: () => root, path }),
);
const router = createRouter({ routeTree: root.addChildren(routes) });
export function Harness() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const viewer = new URLSearchParams(location.search).has("viewer");
  const admin = new URLSearchParams(location.search).has("admin");
  if (path === "/auth") return <main>Login sintético</main>;
  return (
    <>
      <AppShell
        userName="Pessoa de Teste"
        role={viewer ? "Visualização" : admin ? "Administrador" : "Supervisor"}
        modules={
          new URLSearchParams(location.search).has("inbox-badge")
            ? ["inbox", "companies", "contacts"]
            : path === "/categories"
              ? ["categories", "companies", "contacts"]
              : path === "/tickets"
                ? ["tickets", "companies", "contacts"]
                : ["companies", "contacts"]
        }
      >
        {path === "/tickets" ? (
          <TicketsPage
            userId="synthetic-user"
            role={viewer ? "viewer" : "supervisor"}
            technicianId={
              new URLSearchParams(location.search).has("technician") ? "tech-one" : null
            }
          />
        ) : (
          <ResourcePage
            kind={
              path === "/contacts"
                ? "contacts"
                : path === "/categories"
                  ? "categories"
                  : path === "/technicians"
                    ? "technicians"
                    : "companies"
            }
            userId="synthetic-user"
            canManage={!viewer}
            role={viewer ? "viewer" : admin ? "admin" : "supervisor"}
          />
        )}
      </AppShell>
      <Toaster />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
