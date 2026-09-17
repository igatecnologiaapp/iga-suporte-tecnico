CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'technician', 'viewer');
CREATE TYPE public.record_status AS ENUM ('active', 'inactive');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE public.ticket_status AS ENUM ('new', 'triage', 'in_progress', 'waiting_customer', 'waiting_third_party', 'scheduled', 'resolved', 'closed', 'reopened', 'cancelled', 'duplicate');
CREATE TYPE public.ticket_channel AS ENUM ('manual', 'whatsapp', 'email', 'portal', 'other');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  theme_preference text NOT NULL DEFAULT 'system' CHECK (theme_preference IN ('light','dark','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.can_manage_operations(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'supervisor') OR public.has_role(_user_id, 'technician') $$;

CREATE POLICY "Authenticated users read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE initial_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'full_name', split_part(COALESCE(new.email,''), '@', 1)), new.raw_user_meta_data ->> 'avatar_url');
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.user_roles) THEN 'viewer'::public.app_role ELSE 'admin'::public.app_role END INTO initial_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, initial_role);
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text NOT NULL,
  tax_id text NOT NULL,
  phone text,
  phone_normalized text,
  whatsapp text,
  whatsapp_normalized text,
  email text,
  postal_code text,
  address text,
  address_number text,
  complement text,
  district text,
  city text,
  state char(2),
  status public.record_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tax_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  job_title text,
  phone text,
  phone_normalized text,
  whatsapp text,
  whatsapp_normalized text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  status public.record_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  phone text,
  email text NOT NULL,
  specialty text,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technicians TO authenticated;
GRANT ALL ON public.technicians TO service_role;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO authenticated;
GRANT ALL ON public.ticket_categories TO service_role;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sla_policies (
  priority public.ticket_priority PRIMARY KEY,
  acknowledgment_minutes integer NOT NULL CHECK (acknowledgment_minutes > 0),
  first_response_minutes integer NOT NULL CHECK (first_response_minutes > 0),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes > 0),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sla_policies TO authenticated;
GRANT ALL ON public.sla_policies TO service_role;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE public.ticket_number_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.ticket_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ticket_number_seq TO service_role;

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('CH-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  requester_phone text,
  requester_phone_normalized text,
  channel public.ticket_channel NOT NULL DEFAULT 'manual',
  category_id uuid REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  subcategory_id uuid REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  description text NOT NULL,
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  status public.ticket_status NOT NULL DEFAULT 'new',
  assigned_technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  acknowledged_by_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  solution text,
  internal_notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  event_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_events TO authenticated;
GRANT ALL ON public.ticket_events TO service_role;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.ticket_attachments TO authenticated;
GRANT ALL ON public.ticket_attachments TO service_role;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX companies_search_idx ON public.companies (trade_name, legal_name);
CREATE INDEX contacts_company_idx ON public.contacts (company_id);
CREATE INDEX contacts_phone_idx ON public.contacts (phone_normalized, whatsapp_normalized);
CREATE INDEX tickets_company_idx ON public.tickets (company_id, opened_at DESC);
CREATE INDEX tickets_status_idx ON public.tickets (status, priority, opened_at DESC);
CREATE INDEX ticket_events_ticket_idx ON public.ticket_events (ticket_id, created_at DESC);
CREATE INDEX ticket_attachments_ticket_idx ON public.ticket_attachments (ticket_id);

CREATE POLICY "Authenticated read companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Operations update companies" ON public.companies FOR UPDATE TO authenticated USING (public.can_manage_operations(auth.uid())) WITH CHECK (public.can_manage_operations(auth.uid()));
CREATE POLICY "Managers delete companies" ON public.companies FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Authenticated read contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Operations update contacts" ON public.contacts FOR UPDATE TO authenticated USING (public.can_manage_operations(auth.uid())) WITH CHECK (public.can_manage_operations(auth.uid()));
CREATE POLICY "Managers delete contacts" ON public.contacts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Authenticated read technicians" ON public.technicians FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write technicians" ON public.technicians FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Authenticated read categories" ON public.ticket_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write categories" ON public.ticket_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Authenticated read SLA" ON public.sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write SLA" ON public.sla_policies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Authenticated read tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND created_by = auth.uid() AND channel = 'manual');
CREATE POLICY "Operations update tickets" ON public.tickets FOR UPDATE TO authenticated USING (public.can_manage_operations(auth.uid())) WITH CHECK (public.can_manage_operations(auth.uid()));
CREATE POLICY "Authenticated read events" ON public.ticket_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations insert events" ON public.ticket_events FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND actor_id = auth.uid());
CREATE POLICY "Authenticated read attachments" ON public.ticket_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations insert attachments" ON public.ticket_attachments FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "Managers delete attachments" ON public.ticket_attachments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE OR REPLACE FUNCTION public.normalize_phone(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULLIF(regexp_replace(COALESCE(value,''), '[^0-9]', '', 'g'), '') $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN new.updated_at = now(); RETURN new; END; $$;
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER technicians_updated_at BEFORE UPDATE ON public.technicians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.ticket_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_contact_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  new.phone_normalized = public.normalize_phone(new.phone);
  new.whatsapp_normalized = public.normalize_phone(new.whatsapp);
  RETURN new;
END; $$;
CREATE TRIGGER companies_normalize BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_fields();
CREATE TRIGGER contacts_normalize BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_fields();

CREATE OR REPLACE FUNCTION public.prepare_ticket()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  new.requester_phone_normalized = public.normalize_phone(new.requester_phone);
  IF new.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = new.contact_id AND c.company_id = new.company_id) THEN
    RAISE EXCEPTION 'O contato deve pertencer à empresa selecionada';
  END IF;
  IF new.subcategory_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_categories c WHERE c.id = new.subcategory_id AND c.parent_id = new.category_id) THEN
    RAISE EXCEPTION 'A subcategoria deve pertencer à categoria selecionada';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF old.acknowledged_at IS NULL AND new.acknowledged_by_id IS NOT NULL THEN new.acknowledged_at = now(); END IF;
    IF old.first_response_at IS NULL AND new.status = 'in_progress' THEN new.first_response_at = now(); END IF;
    IF old.resolved_at IS NULL AND new.status = 'resolved' THEN new.resolved_at = now(); END IF;
    IF old.closed_at IS NULL AND new.status = 'closed' THEN new.closed_at = now(); END IF;
  END IF;
  RETURN new;
END; $$;
CREATE TRIGGER tickets_prepare BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.prepare_ticket();

CREATE OR REPLACE FUNCTION public.audit_ticket_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN actor := COALESCE(new.created_by, old.created_by); END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_events(ticket_id, actor_id, event_type, new_value, note) VALUES(new.id, actor, 'created', jsonb_build_object('number',new.number,'status',new.status,'priority',new.priority), 'Chamado criado');
    RETURN new;
  END IF;
  IF old.acknowledged_by_id IS DISTINCT FROM new.acknowledged_by_id AND new.acknowledged_by_id IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'acknowledged',to_jsonb(old.acknowledged_by_id),to_jsonb(new.acknowledged_by_id),'Chamado acolhido'); END IF;
  IF old.assigned_technician_id IS DISTINCT FROM new.assigned_technician_id THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'assignment_changed',to_jsonb(old.assigned_technician_id),to_jsonb(new.assigned_technician_id),'Técnico responsável alterado'); END IF;
  IF old.priority IS DISTINCT FROM new.priority THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'priority_changed',to_jsonb(old.priority),to_jsonb(new.priority),'Prioridade alterada'); END IF;
  IF old.status IS DISTINCT FROM new.status THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,CASE WHEN new.status='resolved' THEN 'resolved' WHEN new.status='closed' THEN 'closed' WHEN new.status='reopened' THEN 'reopened' ELSE 'status_changed' END,to_jsonb(old.status),to_jsonb(new.status),'Status alterado'); END IF;
  IF old.internal_notes IS DISTINCT FROM new.internal_notes AND new.internal_notes IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'internal_note',NULL,NULL,new.internal_notes); END IF;
  IF old.solution IS DISTINCT FROM new.solution AND new.solution IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'solution',NULL,NULL,new.solution); END IF;
  RETURN new;
END; $$;
CREATE TRIGGER tickets_audit AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_changes();

CREATE OR REPLACE FUNCTION public.prevent_timeline_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'A timeline é imutável'; END; $$;
CREATE TRIGGER ticket_events_immutable BEFORE UPDATE OR DELETE ON public.ticket_events FOR EACH ROW EXECUTE FUNCTION public.prevent_timeline_mutation();