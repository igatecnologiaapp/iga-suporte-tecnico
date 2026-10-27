/** Área: Preparação de dados fictícios na instância local de homologação. */
import { randomBytes } from "node:crypto";
import { admin, userClient, savePrivate, requireOk } from "./local-support.mjs";
const profiles = {
  primary: "admin",
  admin: "admin",
  supervisor: "supervisor",
  technician: "technician",
  viewer: "viewer",
  restricted: "technician",
  inactive: "viewer",
};
const modules = [
  "inbox",
  "tickets",
  "companies",
  "contacts",
  "categories",
  "sla",
  "technicians",
  "users",
  "integrations",
  "settings",
];
const users = {};
for (const [key, role] of Object.entries(profiles)) {
  const email = `${key}@iga-homologation.example`;
  const password = randomBytes(24).toString("base64url");
  const data = requireOk(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Homologação ${key}` },
    }),
    "create synthetic user",
  );
  const id = data.user.id;
  users[key] = { id, email, password, role };
  requireOk(
    await admin.from("user_roles").update({ role }).eq("user_id", id),
    "assign synthetic role without deleting the initial admin",
  );
  const allowed =
    key === "restricted"
      ? ["tickets"]
      : role === "admin"
        ? modules
        : role === "supervisor"
          ? modules.filter((m) => !["users", "integrations"].includes(m))
          : role === "technician"
            ? ["inbox", "tickets", "companies", "contacts", "settings"]
            : ["tickets", "companies", "contacts", "settings"];
  requireOk(
    await admin.from("user_modules").insert(allowed.map((module) => ({ user_id: id, module }))),
    "assign synthetic modules",
  );
}
requireOk(
  await admin.from("primary_admin").insert({ user_id: users.primary.id }),
  "bootstrap local primary",
);
requireOk(
  await admin.from("profiles").update({ status: "inactive" }).eq("id", users.inactive.id),
  "inactive synthetic account",
);
const signed = userClient();
requireOk(await signed.auth.signInWithPassword(users.primary), "sign in local primary");
const creator = users.primary.id;
const companies = requireOk(
  await signed
    .from("companies")
    .insert([
      {
        legal_name: "Alfa Homologação Ltda",
        trade_name: "Alfa Homologação",
        tax_id: "00000000000191",
        domain: "alfa.example",
        created_by: creator,
      },
      {
        legal_name: "Beta Homologação Ltda",
        trade_name: "Beta Homologação",
        tax_id: "00000000000272",
        domain: "Sem site / uso interno",
        created_by: creator,
      },
      {
        legal_name: "Arquivo Homologação Ltda",
        trade_name: "Arquivo Homologação",
        tax_id: "00000000000353",
        domain: "HTTPS://WWW.ARQUIVO.EXAMPLE/path",
        created_by: creator,
        status: "inactive",
      },
    ])
    .select("*"),
  "seed synthetic companies",
);
const cats = requireOk(
  await signed
    .from("ticket_categories")
    .insert([{ name: "Sistema Homologação" }, { name: "Treinamento Homologação" }])
    .select("*"),
  "seed categories",
);
const subs = requireOk(
  await signed
    .from("ticket_categories")
    .insert([
      { parent_id: cats[0].id, name: "Subcategoria Alfa" },
      { parent_id: cats[0].id, name: "Subcategoria Beta" },
    ])
    .select("*"),
  "seed subcategories",
);
requireOk(
  await signed.from("company_ticket_categories").insert([
    { company_id: companies[0].id, category_id: cats[0].id, is_default: true, created_by: creator },
    { company_id: companies[0].id, category_id: cats[1].id, created_by: creator },
  ]),
  "associate parents",
);
requireOk(
  await signed
    .from("company_ticket_categories")
    .insert({ company_id: companies[0].id, category_id: subs[0].id, created_by: creator }),
  "associate child",
);
const contacts = requireOk(
  await signed
    .from("contacts")
    .insert({
      company_id: companies[0].id,
      name: "Contato Sintético Alfa",
      email: "contato@alfa.example",
      phone: "11900000000",
      is_primary: true,
      created_by: creator,
    })
    .select("*"),
  "seed contact",
);
const tech = requireOk(
  await signed
    .from("technicians")
    .insert({
      user_id: users.technician.id,
      name: "Técnico Homologação",
      email: users.technician.email,
    })
    .select("*"),
  "seed technician",
);
const tickets = requireOk(
  await signed
    .from("tickets")
    .insert({
      company_id: companies[0].id,
      contact_id: contacts[0].id,
      category_id: cats[0].id,
      subcategory_id: subs[0].id,
      subject: "Chamado sintético de homologação",
      description: "Sem cliente real e sem envio externo.",
      channel: "manual",
      created_by: creator,
      assigned_technician_id: tech[0].id,
    })
    .select("*"),
  "seed ticket",
);
for (const bucket of ["ticket-attachments", "whatsapp-media"]) {
  const r = await admin.storage.createBucket(bucket, { public: false });
  if (r.error && !r.error.message.includes("already exists"))
    throw new Error("Failed to create local storage bucket");
}
savePrivate("fixtures.json", {
  users,
  companies,
  categories: cats,
  subcategories: subs,
  contacts,
  technicians: tech,
  tickets,
});
console.log("Synthetic fixtures created; credentials written only to private local storage.");
