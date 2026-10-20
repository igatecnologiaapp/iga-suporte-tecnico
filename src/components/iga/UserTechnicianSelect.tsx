import { Label } from "../ui/label";

type Technician = { id: string; name: string; user_id: string | null };

export function UserTechnicianSelect({
  editing,
  technicians,
}: {
  editing: { id: string; technician_id: string | null } | null;
  technicians: Technician[];
}) {
  return (
    <div className="sm:col-span-2">
      <Label htmlFor="technician_id">Cadastro de técnico</Label>
      <select
        id="technician_id"
        name="technician_id"
        className="form-control"
        defaultValue={editing ? (editing.technician_id ?? "") : "new"}
      >
        {!editing && <option value="new">Criar cadastro a partir deste usuário</option>}
        <option value="">Sem vínculo</option>
        {technicians
          .filter((t) => !t.user_id || t.user_id === editing?.id)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </div>
  );
}
