/** Área: Cadastro, edição, filtros e ciclo de vida de empresas, contatos, técnicos e categorias. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  Archive,
  Building2,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/iga";
import {
  archiveRecord,
  deleteRecord,
  inspectRecord,
  restoreRecord,
  type RecordEntity,
} from "@/lib/records-admin.functions";
import { domainFromForm, normalizeDomain } from "@/lib/company-domain";
import { isCompanyTaxIdConflict, companyTaxIdConflictMessage } from "@/lib/company-save-feedback";
import { CompanyFields } from "./CompanyFields";
import { CompanyOverview } from "./CompanyOverview";
import { CompanyToolbar } from "./CompanyToolbar";
import { ContactOverview } from "./ContactOverview";
import { ContactToolbar, type ContactListFilters } from "./ContactToolbar";
import { CategoryOverview } from "./CategoryOverview";
import { CategoryToolbar, type CategoryListFilters } from "./CategoryToolbar";
import { CategoryColorField } from "./CategoryColorField";
import { CategoryChip } from "./CategoryChip";
import { categoryColor, defaultCategoryColor, type CategoryColor } from "@/lib/category-colors";
import { buildCompanyCategoryChips } from "@/lib/company-category-chips";
import type { CompanyListFilters } from "@/lib/company-list";
import { usePagedRecords } from "./usePagedRecords";
import { TablePager } from "./TablePager";
import { Empty, Page, LoadState } from "./Page";
import { StatusBadge } from "./StatusBadge";
import { ActionHint } from "./ActionHint";
import { RecordName } from "./RecordName";
import { PhoneInput } from "./PhoneInput";
import { formatPhone } from "@/lib/phone-format";
import { preferredContactPhone } from "@/lib/contact-phone";

type Kind = RecordEntity;
const config = {
  companies: {
    title: "Empresas / Clientes",
    desc: "Cadastre e mantenha os clientes atendidos.",
    name: "trade_name",
    table: "companies",
  },
  contacts: {
    title: "Contatos",
    desc: "Gerencie solicitantes vinculados às empresas.",
    name: "name",
    table: "contacts",
  },
  technicians: {
    title: "Técnicos",
    desc: "Organize a equipe técnica vinculada aos usuários.",
    name: "name",
    table: "technicians",
  },
  categories: {
    title: "Categorias de Chamados",
    desc: "Estruture categorias e subcategorias do atendimento.",
    name: "name",
    table: "ticket_categories",
  },
} as const;

/** Coordena formulários, dados paginados e ações autorizadas do tipo de cadastro. */
export function ResourcePage({
  kind,
  userId,
  canManage,
  role,
}: {
  kind: Kind;
  userId: string;
  canManage: boolean;
  role?: string;
}) {
  const c = config[kind];
  const editorTrigger = useRef("");
  const [optionsLoading, setLoading] = useState(true);
  const optionsRequest = useRef(0);
  const [optionsError, setLoadError] = useState<string | null>(null);
  const canDelete = role === "admin";
  const [related, setRelated] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [categoryName, setCategoryName] = useState("");
  const [selectedCategoryColor, setSelectedCategoryColor] =
    useState<CategoryColor>(defaultCategoryColor);
  const [saving, setSaving] = useState(false);
  // Aguarda a consulta de CEP para não salvar o endereço antes do preenchimento automático.
  const [addressLookupPending, setAddressLookupPending] = useState(false);
  const [taxIdError, setTaxIdError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    kind: "archive" | "delete";
    row: any;
    references: { label: string; total: number }[];
    canDelete: boolean;
    activeTickets: number;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [allCats, setAllCats] = useState<any[]>([]);
  const [selCats, setSelCats] = useState<string[]>([]);
  const [defCat, setDefCat] = useState("");
  const [companyFilters, setCompanyFilters] = useState<CompanyListFilters>({
    search: "",
    categoryId: "",
    status: "active",
    sort: "name_asc",
    domain: "all",
  });
  const [contactFilters, setContactFilters] = useState<ContactListFilters>({
    search: "",
    companyId: "",
    status: "active",
    sort: "name_asc",
  });
  const [categoryFilters, setCategoryFilters] = useState<CategoryListFilters>({
    search: "",
    status: "active",
    sort: "name_asc",
  });
  const canLinkCats = role === "admin" || role === "supervisor";

  const pageFilters =
    kind === "companies"
      ? { ...companyFilters }
      : kind === "contacts"
        ? { ...contactFilters }
        : kind === "categories"
          ? { ...categoryFilters }
          : { search: q, status: showArchived ? "all" : "active", sort: "name_asc" };
  const paged = usePagedRecords(kind, pageFilters);
  const rows = paged.data.rows as any[];
  const filtered = rows;
  const links = rows.flatMap((row) => row.category_links ?? []);
  const loading = optionsLoading || paged.loading;
  const loadError = optionsError || paged.error;

  /** Busca somente os catálogos de vínculos necessários ao tipo de cadastro. */
  async function loadOptions() {
    const request = ++optionsRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      if (kind === "companies") {
        const result = await supabase
          .from("ticket_categories")
          .select("id,name,parent_id,status,color")
          .order("name");
        if (result.error) throw result.error;
        if (request === optionsRequest.current) setAllCats(result.data ?? []);
      } else {
        const result =
          kind === "contacts"
            ? await supabase.from("companies").select("id,trade_name,status").order("trade_name")
            : kind === "technicians"
              ? await supabase.from("profiles").select("id,full_name").order("full_name")
              : await supabase
                  .from("ticket_categories")
                  .select("id,name,status,color")
                  .is("parent_id", null)
                  .order("name");
        if (result.error) throw result.error;
        if (request === optionsRequest.current) setRelated(result.data ?? []);
      }
    } catch {
      if (request === optionsRequest.current)
        setLoadError("Não foi possível carregar as opções dos cadastros.");
    } finally {
      if (request === optionsRequest.current) setLoading(false);
    }
  }
  /** Atualiza a página de registros e os catálogos necessários ao editor. */
  async function load() {
    paged.refresh();
    await loadOptions();
  }
  useEffect(() => {
    void loadOptions();
    return () => {
      optionsRequest.current++;
    };
  }, [kind]);
  /** Resolve os nomes e a categoria padrão vinculados à empresa da página atual. */
  function companyCats(id: string) {
    return buildCompanyCategoryChips(links, allCats, id);
  }
  /** Prepara o formulário e seus vínculos para incluir ou editar o cadastro. */
  function openEditor(row: any) {
    setTaxIdError(null);
    editorTrigger.current = row ? `edit-${kind}-${row.id}` : `new-${kind}`;
    setEditing(row);
    setCategoryName(row?.name ?? "");
    setSelectedCategoryColor(categoryColor(row?.color));
    const own = row ? links.filter((l) => l.company_id === row.id) : [];
    setSelCats(own.map((l) => l.category_id));
    setDefCat(own.find((l) => l.is_default)?.category_id ?? "");
    setOpen(true);
  }
  /** Sincroniza os vínculos de categorias da empresa e sua categoria padrão. */
  async function syncCompanyCats(companyId: string) {
    const del = supabase.from("company_ticket_categories").delete().eq("company_id", companyId);
    const r1 = selCats.length
      ? await del.not("category_id", "in", `(${selCats.join(",")})`)
      : await del;
    if (r1.error) return r1.error;
    const r2 = await supabase
      .from("company_ticket_categories")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("is_default", true);
    if (r2.error) return r2.error;
    if (selCats.length) {
      const r3 = await supabase.from("company_ticket_categories").upsert(
        selCats.map((id) => ({ company_id: companyId, category_id: id, created_by: userId })),
        { onConflict: "company_id,category_id", ignoreDuplicates: true },
      );
      if (r3.error) return r3.error;
    }
    if (defCat && selCats.includes(defCat)) {
      const r4 = await supabase
        .from("company_ticket_categories")
        .update({ is_default: true })
        .eq("company_id", companyId)
        .eq("category_id", defCat);
      if (r4.error) return r4.error;
    }
    return null;
  }

  /** Monta os dados do cadastro, trata documento duplicado e sincroniza categorias após salvar. */
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || addressLookupPending) return;
    setTaxIdError(null);
    setSaving(true);
    const fd = new FormData(event.currentTarget);
    let payload: any = {};
    if (kind === "companies") {
      const domain = domainFromForm(fd, editing?.domain);
      if (domain) {
        // The matching company may be outside the current page or filters.
        const { data: matches } = await supabase
          .from("companies")
          .select("id,trade_name")
          .eq("domain", domain)
          .limit(2);
        const other = matches?.find((row) => row.id !== editing?.id);
        if (other)
          toast.info(`Atenção: o domínio ${domain} já está cadastrado em ${other.trade_name}.`);
      }
      payload = {
        legal_name: fd.get("legal_name"),
        trade_name: fd.get("trade_name"),
        tax_id: fd.get("tax_id"),
        domain,
        phone: fd.get("phone") || null,
        whatsapp: fd.get("whatsapp") || null,
        email: fd.get("email") || null,
        postal_code: fd.get("postal_code") || null,
        address: fd.get("address") || null,
        address_number: fd.get("address_number") || null,
        complement: fd.get("complement") || null,
        district: fd.get("district") || null,
        city: fd.get("city") || null,
        state: fd.get("state") || null,
        notes: fd.get("notes") || null,
        status: fd.get("status"),
      };
    }
    if (kind === "contacts")
      payload = {
        company_id: fd.get("company_id"),
        name: fd.get("name"),
        job_title: fd.get("job_title") || null,
        phone: fd.get("phone") || null,
        whatsapp: fd.get("whatsapp") || null,
        email: fd.get("email") || null,
        is_primary: fd.get("is_primary") === "on",
        status: fd.get("status"),
      };
    if (kind === "technicians")
      payload = {
        user_id: fd.get("user_id"),
        name: fd.get("name"),
        phone: fd.get("phone") || null,
        email: fd.get("email"),
        specialty: fd.get("specialty") || null,
        status: fd.get("status"),
      };
    if (kind === "categories")
      payload = {
        name: fd.get("name"),
        color: selectedCategoryColor,
        parent_id: fd.get("parent_id") || null,
        status: fd.get("status"),
      };
    if (!editing && (kind === "companies" || kind === "contacts")) payload.created_by = userId;
    const query = editing
      ? supabase
          .from(c.table)
          .update(payload as never)
          .eq("id", editing.id)
          .select("id")
      : supabase
          .from(c.table)
          .insert(payload as never)
          .select("id");
    const { data: saved, error } = await query;
    if (error) {
      setSaving(false);
      if (kind === "companies" && isCompanyTaxIdConflict(error)) {
        setTaxIdError(companyTaxIdConflictMessage);
        document.getElementById("tax_id")?.focus();
      } else
        toast.error(
          kind === "companies"
            ? "Não foi possível salvar a empresa. Confira os dados e tente novamente."
            : errorMessage(error),
        );
      return;
    }
    if (kind === "companies" && canLinkCats) {
      const id = editing?.id ?? (saved as any)?.[0]?.id;
      const linkError = id ? await syncCompanyCats(id) : null;
      if (linkError) {
        setSaving(false);
        toast.error(
          "Empresa salva, mas as categorias não foram atualizadas: " + errorMessage(linkError),
        );
        await load();
        return;
      }
    }
    setSaving(false);
    toast.success(editing ? "Cadastro atualizado." : "Cadastro salvo com sucesso.");
    setOpen(false);
    setEditing(null);
    await load();
  }
  /** Fecha o editor e restaura o foco no controle que o abriu. */
  function close(next: boolean) {
    setOpen(next);
    if (!next) setEditing(null);
  }

  /** Consulta referências do registro antes de oferecer arquivamento ou exclusão. */
  async function startAction(kindOfAction: "archive" | "delete", row: any) {
    try {
      const info = await inspectRecord({ data: { entity: kind, id: row.id } });
      setReason("");
      setAction({
        kind: kindOfAction,
        row,
        references: info.references,
        canDelete: info.canDelete,
        activeTickets: info.activeTickets,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  /** Executa a ação confirmada com motivo e atualiza os dados da listagem. */
  async function confirmAction() {
    if (!action) return;
    setSaving(true);
    try {
      if (action.kind === "archive") {
        await archiveRecord({ data: { entity: kind, id: action.row.id, reason } });
        toast.success("Registro arquivado.");
        setAction(null);
      } else {
        const result = await deleteRecord({ data: { entity: kind, id: action.row.id, reason } });
        if (result.deleted) {
          toast.success(result.message);
          setAction(null);
        } else {
          toast.error(result.message);
          setAction((prev) => (prev ? { ...prev, kind: "archive", canDelete: false } : prev));
        }
      }
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  /** Solicita a restauração do registro e recarrega os dados autorizados. */
  async function restore(row: any) {
    try {
      await restoreRecord({ data: { entity: kind, id: row.id } });
      toast.success("Registro restaurado.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Page
      title={c.title}
      description={c.desc}
      action={
        canManage ? (
          <Button
            id={`new-${kind}`}
            className={
              kind === "companies" || kind === "contacts" || kind === "categories"
                ? "resource-create-action"
                : undefined
            }
            disabled={loading || !!loadError}
            onClick={() => openEditor(null)}
          >
            <Plus />
            Novo cadastro
          </Button>
        ) : undefined
      }
    >
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(editorTrigger.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
            <DialogDescription>Preencha os dados obrigatórios.</DialogDescription>
          </DialogHeader>
          <form key={editing?.id ?? "new"} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {kind === "companies" && (
              <>
                <CompanyFields
                  onAddressLookupPending={setAddressLookupPending}
                  company={editing}
                  taxIdError={taxIdError}
                  onTaxIdChange={() => setTaxIdError(null)}
                />
                <fieldset className="rounded-md border p-3 sm:col-span-2">
                  <legend className="px-1 text-sm font-medium">Categorias de Chamados</legend>
                  {!canLinkCats ? (
                    <CatChips cats={editing ? companyCats(editing.id) : []} />
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Opcional. Sem categorias, a abertura de chamado mostra todas as categorias
                        ativas. Marcar uma subcategoria restringe a abertura de chamado a ela dentro
                        da categoria principal.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {allCats
                          .filter(
                            (cat) =>
                              !cat.parent_id &&
                              (cat.status === "active" || selCats.includes(cat.id)),
                          )
                          .map((cat) => {
                            const on = selCats.includes(cat.id);
                            const subs = allCats.filter(
                              (s) =>
                                s.parent_id === cat.id &&
                                (s.status === "active" || selCats.includes(s.id)),
                            );
                            return (
                              <div key={cat.id} className="rounded border px-2 py-1.5 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) => {
                                        const subIds = subs.map((s) => s.id);
                                        const next = e.target.checked
                                          ? [...selCats, cat.id]
                                          : selCats.filter(
                                              (x) => x !== cat.id && !subIds.includes(x),
                                            );
                                        setSelCats(next);
                                        if (!e.target.checked && defCat === cat.id) setDefCat("");
                                      }}
                                    />
                                    {cat.name}
                                    {cat.status !== "active" && (
                                      <span className="text-xs text-muted-foreground">
                                        (inativa)
                                      </span>
                                    )}
                                  </label>
                                  <label
                                    className={
                                      "flex items-center gap-1 text-xs " + (on ? "" : "opacity-40")
                                    }
                                  >
                                    <input
                                      type="radio"
                                      name="default_category"
                                      disabled={!on}
                                      checked={defCat === cat.id}
                                      onChange={() => setDefCat(cat.id)}
                                    />
                                    Padrão
                                  </label>
                                </div>
                                {subs.length > 0 && (
                                  <div className="mt-1 space-y-1 border-l pl-4">
                                    {subs.map((sub) => {
                                      const subOn = selCats.includes(sub.id);
                                      return (
                                        <label
                                          key={sub.id}
                                          className={
                                            "flex items-center gap-2 text-xs " +
                                            (on ? "" : "opacity-40")
                                          }
                                        >
                                          <input
                                            type="checkbox"
                                            disabled={!on}
                                            checked={subOn}
                                            onChange={(e) =>
                                              setSelCats(
                                                e.target.checked
                                                  ? [...selCats, sub.id]
                                                  : selCats.filter((x) => x !== sub.id),
                                              )
                                            }
                                          />
                                          {sub.name}
                                          {sub.status !== "active" && (
                                            <span className="text-muted-foreground">(inativa)</span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                      {defCat && (
                        <button
                          type="button"
                          className="mt-2 text-xs text-primary hover:underline"
                          onClick={() => setDefCat("")}
                        >
                          Remover categoria padrão
                        </button>
                      )}
                    </>
                  )}
                </fieldset>
              </>
            )}
            {kind === "contacts" && (
              <>
                <SelectField
                  n="company_id"
                  l="Empresa / Cliente"
                  rows={related.filter(
                    (company) => company.status === "active" || company.id === editing?.company_id,
                  )}
                  value={editing?.company_id}
                />
                <Field n="name" l="Nome" value={editing?.name} />
                <Field n="job_title" l="Cargo / Função" req={false} value={editing?.job_title} />
                <Field n="phone" l="Telefone" req={false} value={editing?.phone} />
                <Field n="whatsapp" l="WhatsApp" req={false} value={editing?.whatsapp} />
                <Field n="email" l="E-mail" type="email" req={false} value={editing?.email} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="is_primary"
                    defaultChecked={editing?.is_primary ?? false}
                  />
                  Contato principal
                </label>
              </>
            )}
            {kind === "technicians" && (
              <>
                <SelectField
                  n="user_id"
                  l="Usuário vinculado"
                  rows={related}
                  value={editing?.user_id}
                />
                <Field n="name" l="Nome" value={editing?.name} />
                <Field n="phone" l="Telefone" req={false} value={editing?.phone} />
                <Field n="email" l="E-mail" type="email" value={editing?.email} />
                <Field n="specialty" l="Especialidade" req={false} value={editing?.specialty} />
              </>
            )}
            {kind === "categories" && (
              <>
                <div className="space-y-2">
                  <Label required htmlFor="name">
                    Nome
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                  />
                  <CategoryColorField
                    name={categoryName}
                    color={selectedCategoryColor}
                    onChange={setSelectedCategoryColor}
                  />
                </div>
                <SelectField
                  n="parent_id"
                  l="Categoria superior (opcional)"
                  rows={related.filter(
                    (row) =>
                      row.id !== editing?.id &&
                      (row.status === "active" || row.id === editing?.parent_id),
                  )}
                  optional
                  value={editing?.parent_id}
                />
              </>
            )}
            <div>
              <Label htmlFor="record-status">Status</Label>
              <select
                id="record-status"
                name="status"
                className="form-control"
                defaultValue={editing?.status ?? "active"}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo / Arquivado</option>
              </select>
            </div>
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={saving || loading || !!loadError || addressLookupPending}>
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {kind === "companies" && !loadError && (
        <CompanyOverview summary={paged.data.summary} loading={loading} />
      )}
      {kind === "contacts" && !loadError && (
        <ContactOverview summary={paged.data.summary} loading={loading} />
      )}
      {kind === "categories" && !loadError && (
        <CategoryOverview summary={paged.data.summary} loading={loading} />
      )}
      {kind === "companies" ? (
        <CompanyToolbar
          filters={companyFilters}
          counts={paged.data.counts}
          visibleCount={paged.data.total}
          categories={allCats}
          unavailable={loading || !!loadError}
          onChange={setCompanyFilters}
        />
      ) : kind === "contacts" ? (
        <ContactToolbar
          filters={contactFilters}
          counts={paged.data.counts}
          visibleCount={paged.data.total}
          companies={related}
          unavailable={loading || !!loadError}
          onChange={setContactFilters}
        />
      ) : kind === "categories" ? (
        <CategoryToolbar
          filters={categoryFilters}
          counts={paged.data.counts}
          visibleCount={paged.data.total}
          unavailable={loading || !!loadError}
          onChange={setCategoryFilters}
        />
      ) : (
        <div className="resource-toolbar flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-[1_1_16rem]">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
            />
            <Input
              className="pl-9"
              aria-label="Pesquisar cadastros"
              maxLength={300}
              placeholder="Pesquisar..."
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Mostrar arquivados/inativos
          </label>
        </div>
      )}

      <div className="paged-table" aria-busy={loading}>
        {loading && !paged.hasRetainedRows ? (
          <LoadState loading />
        ) : loadError ? (
          <LoadState error={loadError} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <Empty>
            Nenhum cadastro encontrado.{" "}
            {kind === "companies" || kind === "contacts" || kind === "categories" || q
              ? "Altere a pesquisa, os filtros ou a situação para tentar novamente."
              : "Os cadastros aparecerão aqui."}
          </Empty>
        ) : (
          <div
            inert={loading || undefined}
            className={`resource-table overflow-hidden rounded-xl border bg-card ${kind === "companies" ? "company-table" : kind === "contacts" ? "contact-table" : kind === "categories" ? "category-table" : ""}`}
          >
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Lista de cadastros"
              tabIndex={0}
            >
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {c.title}: {filtered.length} registro(s)
                </caption>
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-4 py-3">{kind === "contacts" ? "Contato" : "Nome"}</th>
                    {kind === "contacts" ? (
                      <>
                        <th className="px-4 py-3">Empresa</th>
                        <th className="px-4 py-3">Cargo / Função</th>
                        <th className="px-4 py-3">Telefone</th>
                      </>
                    ) : kind === "categories" ? (
                      <>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Categoria superior</th>
                      </>
                    ) : (
                      <th className="px-4 py-3">Detalhe</th>
                    )}
                    <th className="px-4 py-3 text-center">Status</th>
                    {canManage && <th className="w-40 px-4 py-3 text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-3 font-medium">
                        {kind === "companies" || kind === "contacts" || kind === "categories" ? (
                          <RecordName
                            kind={
                              kind === "companies"
                                ? "company"
                                : kind === "contacts"
                                  ? "contact"
                                  : row.parent_id
                                    ? "subcategory"
                                    : "category"
                            }
                            name={row[c.name]}
                            detail={kind === "contacts" ? row.email : undefined}
                            categoryColor={kind === "categories" ? row.color : undefined}
                          />
                        ) : (
                          row[c.name]
                        )}
                      </td>
                      {kind === "contacts" ? (
                        <>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <Building2
                                aria-hidden="true"
                                className="size-4 shrink-0 text-primary"
                              />
                              <span>
                                {row.companies?.trade_name ?? "Empresa indisponível"}
                                {row.companies?.status === "inactive" && (
                                  <small className="block">Inativa / arquivada</small>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.job_title?.trim() || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <ContactPhone contact={row} />
                          </td>
                        </>
                      ) : kind === "categories" ? (
                        <>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.parent_id ? "Subcategoria" : "Categoria"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.parent_id ? (
                              <span>
                                {related.find((parent) => parent.id === row.parent_id)?.name ??
                                  "Categoria indisponível"}
                                {related.find((parent) => parent.id === row.parent_id)?.status ===
                                  "inactive" && (
                                  <small className="block">Inativa / arquivada</small>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.legal_name ||
                            row.email ||
                            (row.parent_id ? "Subcategoria" : "Categoria") ||
                            "—"}
                          {kind === "companies" && row.domain && <DomainValue value={row.domain} />}
                          {kind === "companies" && (
                            <div className="mt-1">
                              <CatChips cats={companyCats(row.id)} />
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <StatusBadge
                          value={row.status}
                          kind="record"
                          inactiveLabel="Inativo / Arquivado"
                        />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <ActionHint disabled={false} message="Editar cadastro">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEditor(row)}
                                id={`edit-${kind}-${row.id}`}
                                aria-label={`Editar ${row[c.name]}`}
                              >
                                <Pencil />
                              </Button>
                            </ActionHint>
                            {row.status === "inactive" ? (
                              <ActionHint disabled={false} message="Restaurar cadastro">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => void restore(row)}
                                  aria-label={`Restaurar ${row[c.name]}`}
                                >
                                  <ArchiveRestore />
                                </Button>
                              </ActionHint>
                            ) : (
                              <ActionHint disabled={false} message="Arquivar cadastro">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => void startAction("archive", row)}
                                  aria-label={`Arquivar ${row[c.name]}`}
                                >
                                  <Archive />
                                </Button>
                              </ActionHint>
                            )}
                            {canDelete && (
                              <ActionHint disabled={false} message="Excluir cadastro">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:ring-destructive"
                                  onClick={() => void startAction("delete", row)}
                                  aria-label={`Excluir ${row[c.name]}`}
                                >
                                  <Trash2 />
                                </Button>
                              </ActionHint>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loadError && (
          <TablePager
            label={c.title}
            total={paged.data.total}
            page={paged.page}
            busy={loading}
            onPage={paged.setPage}
          />
        )}
      </div>

      <Dialog
        open={action !== null}
        onOpenChange={(next) => {
          if (!next) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "archive" ? "Arquivar registro?" : "Excluir registro?"}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "archive"
                ? `${action?.row?.[c.name]} deixará de aparecer nas seleções operacionais, mas continua consultável e pode ser restaurado.`
                : action?.canDelete
                  ? `${action?.row?.[c.name]} não possui histórico e pode ser excluído definitivamente.`
                  : `${action?.row?.[c.name]} possui histórico (${action?.references.map((r) => `${r.total} ${r.label}`).join(", ")}) e por isso será arquivado em vez de excluído.`}
            </DialogDescription>
          </DialogHeader>
          {action?.activeTickets ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              Atenção: este técnico possui {action.activeTickets} chamado(s) ainda em aberto.
              Redistribua os chamados antes de concluir.
            </p>
          ) : null}
          <div>
            <Label required htmlFor="action-reason">
              Motivo
            </Label>
            <Textarea
              id="action-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button
              variant={action?.kind === "delete" && action.canDelete ? "destructive" : "default"}
              disabled={saving || !reason.trim()}
              onClick={() => void confirmAction()}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
/** Renderiza o canal preferido de cada contato usando a mesma regra de alternativa da listagem. */
function ContactPhone({ contact }: { contact: Parameters<typeof preferredContactPhone>[0] }) {
  const preferred = preferredContactPhone(contact);
  if (!preferred) return <>—</>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <Phone aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span>
        {formatPhone(preferred.value)}
        {preferred.channel === "whatsapp" && <small className="block">WhatsApp</small>}
      </span>
    </span>
  );
}
/** Exibe o domínio e cria link externo apenas quando a normalização é válida. */
function DomainValue({ value }: { value: string }) {
  if (!value.trim()) return null;
  const href = normalizeDomain(value);
  return (
    <div className="mt-0.5 text-xs">
      <span className="text-muted-foreground">Domínio: </span>
      {href ? (
        <a
          href={`https://${href}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}
/** Renderiza um campo cadastral e escolhe a máscara adequada para telefone. */
function Field({
  n,
  l,
  type = "text",
  req = true,
  value,
}: {
  n: string;
  l: string;
  type?: string;
  req?: boolean;
  value?: unknown;
}) {
  return (
    <div>
      <Label required={req} htmlFor={n}>
        {l}
      </Label>
      {n === "phone" || n === "whatsapp" ? (
        <PhoneInput
          kind={n === "whatsapp" ? "whatsapp" : "phone"}
          id={n}
          name={n}
          required={req}
          defaultValue={value == null ? "" : String(value)}
        />
      ) : (
        <Input
          id={n}
          name={n}
          type={type}
          required={req}
          defaultValue={value == null ? "" : String(value)}
        />
      )}
    </div>
  );
}
/** Monta a seleção de vínculo e identifica sua obrigatoriedade. */
function SelectField({
  n,
  l,
  rows,
  optional = false,
  value,
}: {
  n: string;
  l: string;
  rows: any[];
  optional?: boolean;
  value?: unknown;
}) {
  return (
    <div>
      <Label required={!optional} htmlFor={n}>
        {l}
      </Label>
      <select
        id={n}
        name={n}
        required={!optional}
        className="form-control"
        defaultValue={value == null ? "" : String(value)}
      >
        <option value="">Selecione</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.trade_name || row.full_name || row.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Apresenta os vínculos de categorias, destacando a categoria padrão. */
function CatChips({
  cats,
}: {
  cats: { category_id: string; name: string; is_default: boolean; color: string }[];
}) {
  if (!cats.length)
    return (
      <span className="text-xs text-muted-foreground">Nenhuma categoria de chamado associada</span>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {cats.map((c) => (
        <CategoryChip key={c.category_id} name={c.name} color={c.color} isDefault={c.is_default} />
      ))}
    </div>
  );
}
