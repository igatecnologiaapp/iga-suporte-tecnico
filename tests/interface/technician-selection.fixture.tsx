import { renderToString } from "react-dom/server";
import { UserTechnicianSelect } from "../../src/components/iga/UserTechnicianSelect";

export function render(url: string) {
  const mode = new URL(url, "http://127.0.0.1").searchParams.get("mode");
  const technicianId = "00000000-0000-4000-8000-000000000010";
  const html = renderToString(
    <form>
      <UserTechnicianSelect
        editing={
          mode === "create"
            ? null
            : {
                id: "synthetic-user",
                technician_id: mode === "linked" ? technicianId : null,
              }
        }
        technicians={[
          { id: technicianId, name: "Técnico existente", user_id: "synthetic-user" },
          { id: "00000000-0000-4000-8000-000000000011", name: "Técnico disponível", user_id: null },
          {
            id: "00000000-0000-4000-8000-000000000012",
            name: "Técnico de outro usuário",
            user_id: "other-user",
          },
        ]}
      />
      <label>
        <input name="modules" type="checkbox" value="contacts" />
        Contatos
      </label>
    </form>,
  );
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}
