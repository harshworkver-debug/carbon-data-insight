
-- facilities
CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facilities_company_idx ON public.facilities(company_id);
CREATE INDEX IF NOT EXISTS facilities_region_idx  ON public.facilities(company_id, region);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_region TEXT,
  ADD COLUMN IF NOT EXISTS assigned_facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

ALTER TABLE public.ghg_entries
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ghg_entries_facility_idx ON public.ghg_entries(facility_id);

ALTER TABLE public.calculated_emissions
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

-- helpers
CREATE OR REPLACE FUNCTION public.user_assigned_region()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_region FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_assigned_facility_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_facility_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'global_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'user'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.facility_region(_facility_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT region FROM public.facilities WHERE id = _facility_id
$$;

CREATE OR REPLACE FUNCTION public.can_access_scope(_company_id UUID, _facility_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company UUID := public.current_user_company_id();
BEGIN
  IF _company_id IS DISTINCT FROM v_company THEN
    RETURN public.has_role(auth.uid(), 'admin'::public.app_role);
  END IF;
  IF public.is_global_admin() THEN RETURN TRUE; END IF;
  IF public.has_role(auth.uid(), 'regional_director'::public.app_role) THEN
    RETURN _facility_id IS NOT NULL
       AND public.facility_region(_facility_id) = public.user_assigned_region();
  END IF;
  IF public.has_role(auth.uid(), 'plant_manager'::public.app_role) THEN
    RETURN _facility_id IS NOT NULL
       AND _facility_id = public.user_assigned_facility_id();
  END IF;
  RETURN FALSE;
END $$;

-- facilities policies
DROP POLICY IF EXISTS "facilities_select" ON public.facilities;
DROP POLICY IF EXISTS "facilities_insert" ON public.facilities;
DROP POLICY IF EXISTS "facilities_update" ON public.facilities;
DROP POLICY IF EXISTS "facilities_delete" ON public.facilities;

CREATE POLICY "facilities_select" ON public.facilities FOR SELECT TO authenticated
USING (
  (company_id = public.current_user_company_id() AND (
    public.is_global_admin()
    OR (public.has_role(auth.uid(),'regional_director'::public.app_role) AND region = public.user_assigned_region())
    OR (public.has_role(auth.uid(),'plant_manager'::public.app_role) AND id = public.user_assigned_facility_id())
  ))
  OR public.has_role(auth.uid(),'admin'::public.app_role)
);
CREATE POLICY "facilities_insert" ON public.facilities FOR INSERT TO authenticated
WITH CHECK ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "facilities_update" ON public.facilities FOR UPDATE TO authenticated
USING ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "facilities_delete" ON public.facilities FOR DELETE TO authenticated
USING ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));

-- ghg_entries policies
DROP POLICY IF EXISTS "Users can view their company's entries" ON public.ghg_entries;
DROP POLICY IF EXISTS "Users can insert entries for their company" ON public.ghg_entries;
DROP POLICY IF EXISTS "Users can update unlocked entries in their company" ON public.ghg_entries;
DROP POLICY IF EXISTS "Users can delete unlocked entries in their company" ON public.ghg_entries;

CREATE POLICY "ghg_entries_select" ON public.ghg_entries FOR SELECT TO authenticated
USING (public.can_access_scope(company_id, facility_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "ghg_entries_insert" ON public.ghg_entries FOR INSERT TO authenticated
WITH CHECK (entered_by = auth.uid() AND public.can_access_scope(company_id, facility_id));

CREATE POLICY "ghg_entries_update" ON public.ghg_entries FOR UPDATE TO authenticated
USING (
  public.can_access_scope(company_id, facility_id)
  AND locked_at > now()
  AND NOT public.has_role(auth.uid(),'regional_director'::public.app_role)
);

CREATE POLICY "ghg_entries_delete" ON public.ghg_entries FOR DELETE TO authenticated
USING (
  locked_at > now()
  AND public.is_global_admin()
  AND company_id = public.current_user_company_id()
);

-- calculated_emissions policies
DROP POLICY IF EXISTS "Users can view their company's calculated emissions" ON public.calculated_emissions;
DROP POLICY IF EXISTS "Users can insert calculated emissions for their company" ON public.calculated_emissions;

CREATE POLICY "calc_emissions_select" ON public.calculated_emissions FOR SELECT TO authenticated
USING (public.can_access_scope(company_id, facility_id) OR public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "calc_emissions_insert" ON public.calculated_emissions FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_user_company_id());

-- update calculation trigger to carry facility_id
CREATE OR REPLACE FUNCTION public.calculate_emission_for_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_factor RECORD;
  v_qty NUMERIC;
  v_co2e NUMERIC;
BEGIN
  SELECT id, unit, co2e_factor INTO v_factor
    FROM public.emission_factors
   WHERE scope = NEW.scope AND sub_type = NEW.sub_type LIMIT 1;

  IF v_factor.id IS NULL THEN
    INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg, facility_id)
    VALUES (NEW.company_id, NEW.id, NULL, 0, NEW.facility_id);
    RETURN NEW;
  END IF;

  v_qty := NEW.quantity;
  IF lower(v_factor.unit) = 'mwh' AND lower(NEW.unit) = 'kwh' THEN
    v_qty := v_qty / 1000.0;
  ELSIF lower(v_factor.unit) = 'kwh' AND lower(NEW.unit) = 'mwh' THEN
    v_qty := v_qty * 1000.0;
  END IF;

  v_co2e := v_qty * v_factor.co2e_factor;

  INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg, facility_id)
  VALUES (NEW.company_id, NEW.id, v_factor.id, v_co2e, NEW.facility_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg, facility_id)
  VALUES (NEW.company_id, NEW.id, NULL, 0, NEW.facility_id);
  RETURN NEW;
END $$;

-- api_keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hashed_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_company_idx ON public.api_keys(company_id);

GRANT SELECT, INSERT, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_insert" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_delete" ON public.api_keys;

CREATE POLICY "api_keys_select" ON public.api_keys FOR SELECT TO authenticated
USING ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "api_keys_insert" ON public.api_keys FOR INSERT TO authenticated
WITH CHECK ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "api_keys_delete" ON public.api_keys FOR DELETE TO authenticated
USING ((company_id = public.current_user_company_id() AND public.is_global_admin()) OR public.has_role(auth.uid(),'admin'::public.app_role));
