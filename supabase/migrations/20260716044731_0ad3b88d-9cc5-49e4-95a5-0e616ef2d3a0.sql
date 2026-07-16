
-- =========================================================================
-- FULL RESET — Carbon Clarity: admin + client only
-- =========================================================================

-- 1. Drop policies that reference soon-to-be-removed helpers/columns
DROP POLICY IF EXISTS "ghg_entries_delete" ON public.ghg_entries;
DROP POLICY IF EXISTS "ghg_entries_insert" ON public.ghg_entries;
DROP POLICY IF EXISTS "ghg_entries_select" ON public.ghg_entries;
DROP POLICY IF EXISTS "ghg_entries_update" ON public.ghg_entries;
DROP POLICY IF EXISTS "calc_emissions_insert" ON public.calculated_emissions;
DROP POLICY IF EXISTS "calc_emissions_select" ON public.calculated_emissions;
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own company" ON public.companies;
DROP POLICY IF EXISTS "Users without a company can create one" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete emission factors" ON public.emission_factors;
DROP POLICY IF EXISTS "Admins can insert emission factors" ON public.emission_factors;
DROP POLICY IF EXISTS "Admins can update emission factors" ON public.emission_factors;
DROP POLICY IF EXISTS "All authenticated users can read emission factors" ON public.emission_factors;

-- 2. Drop dependent tables
DROP TABLE IF EXISTS public.api_keys CASCADE;

-- Clear test data before schema changes so triggers/FKs don't fight us
TRUNCATE public.calculated_emissions CASCADE;
TRUNCATE public.ghg_entries CASCADE;

-- 3. Drop facility-related columns and the facilities table
ALTER TABLE public.ghg_entries DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.ghg_entries DROP COLUMN IF EXISTS locked_at;
ALTER TABLE public.ghg_entries DROP COLUMN IF EXISTS corrects_entry_id;
ALTER TABLE public.calculated_emissions DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS assigned_region;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS assigned_facility_id;
DROP TABLE IF EXISTS public.facilities CASCADE;

-- 4. Drop helper functions & triggers no longer needed
DROP TRIGGER IF EXISTS trg_enforce_entry_edit_lock ON public.ghg_entries;
DROP FUNCTION IF EXISTS public.enforce_entry_edit_lock() CASCADE;
DROP FUNCTION IF EXISTS public.can_access_scope(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_global_admin() CASCADE;
DROP FUNCTION IF EXISTS public.user_assigned_region() CASCADE;
DROP FUNCTION IF EXISTS public.user_assigned_facility_id() CASCADE;
DROP FUNCTION IF EXISTS public.facility_region(uuid) CASCADE;

-- 5. Rebuild the app_role enum with only 'admin' and 'client'
--    (existing 'user' rows migrate to 'client')
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
UPDATE public.user_roles SET role = 'client' WHERE role NOT IN ('admin', 'client');
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP TYPE IF EXISTS public.app_role;
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

-- 6. Rebuild core security-definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- Lock down direct EXECUTE from clients (policies invoke as table owner)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_company_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;

-- 7. Signup trigger: new users get the 'client' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 8. Emission calculation trigger — simpler (no facility linkage)
CREATE OR REPLACE FUNCTION public.calculate_emission_for_entry()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_factor RECORD;
  v_qty NUMERIC;
  v_co2e NUMERIC;
BEGIN
  SELECT id, unit, co2e_factor INTO v_factor
    FROM public.emission_factors
   WHERE scope = NEW.scope AND sub_type = NEW.sub_type
   LIMIT 1;

  IF v_factor.id IS NULL THEN
    -- No factor available: record NULL co2e so the UI can show "not available"
    INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg)
    VALUES (NEW.company_id, NEW.id, NULL, NULL);
    RETURN NEW;
  END IF;

  v_qty := NEW.quantity;
  IF lower(v_factor.unit) = 'mwh' AND lower(NEW.unit) = 'kwh' THEN
    v_qty := v_qty / 1000.0;
  ELSIF lower(v_factor.unit) = 'kwh' AND lower(NEW.unit) = 'mwh' THEN
    v_qty := v_qty * 1000.0;
  END IF;

  v_co2e := v_qty * v_factor.co2e_factor;

  INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg)
  VALUES (NEW.company_id, NEW.id, v_factor.id, v_co2e);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.calculate_emission_for_entry() FROM PUBLIC, anon, authenticated;

-- Allow NULL co2e_kg now that "no factor" is represented as NULL
ALTER TABLE public.calculated_emissions ALTER COLUMN co2e_kg DROP NOT NULL;

-- 9. RE-CREATE RLS POLICIES (simple: same-company OR admin)

-- companies
CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_user_company_id() OR public.is_admin());
CREATE POLICY "companies_admin_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "companies_admin_update" ON public.companies FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "companies_admin_delete" ON public.companies FOR DELETE TO authenticated
  USING (public.is_admin());

-- profiles
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- user_roles
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ghg_entries — clients read/write ONLY their own company; admins full
CREATE POLICY "ghg_entries_select" ON public.ghg_entries FOR SELECT TO authenticated
  USING (company_id = public.current_user_company_id() OR public.is_admin());
CREATE POLICY "ghg_entries_insert" ON public.ghg_entries FOR INSERT TO authenticated
  WITH CHECK (
    entered_by = auth.uid()
    AND (company_id = public.current_user_company_id() OR public.is_admin())
  );
CREATE POLICY "ghg_entries_update_admin" ON public.ghg_entries FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "ghg_entries_delete_own_or_admin" ON public.ghg_entries FOR DELETE TO authenticated
  USING (
    (company_id = public.current_user_company_id() AND entered_by = auth.uid())
    OR public.is_admin()
  );

-- calculated_emissions — read-only for the app; trigger inserts as SECURITY DEFINER
CREATE POLICY "calc_emissions_select" ON public.calculated_emissions FOR SELECT TO authenticated
  USING (company_id = public.current_user_company_id() OR public.is_admin());

-- emission_factors — everyone signed-in can read; only admins mutate
CREATE POLICY "emission_factors_select" ON public.emission_factors FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "emission_factors_admin_write" ON public.emission_factors FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 10. Reseed emission_factors with exactly the 10 spec rows
DELETE FROM public.emission_factors;

-- Note on the grid factor:
-- CEA v21.0 publishes 0.7117 tCO2 per MWh. 1 MWh = 1000 kWh, so
-- 0.7117 t/MWh = 711.7 kg/MWh = 0.7117 kg CO2e per kWh.
-- Users enter kWh (as printed on Indian electricity bills); we store the
-- factor in kg per kWh so `quantity_kwh * factor` gives kg CO2e directly.
INSERT INTO public.emission_factors (scope, category, sub_type, unit, co2e_factor, source, version_year, is_proxy_data) VALUES
  ('scope_1','Stationary Combustion','Diesel (HSD) - Generator/Boiler','Liters',2.6800,'IPCC 2006 Guidelines for National GHG Inventories','2006', false),
  ('scope_1','Mobile Combustion','Diesel (HSD) - Vehicles','Liters',2.6444,'India GHG Program - Road Transport Emission Factors','2015', false),
  ('scope_1','Stationary Combustion','Petrol - Generator/Equipment','Liters',2.3100,'IPCC 2006 Guidelines for National GHG Inventories','2006', false),
  ('scope_1','Mobile Combustion','Petrol - Vehicles','Liters',2.2719,'India GHG Program - Road Transport Emission Factors','2015', false),
  ('scope_1','Stationary Combustion','LPG','kg',2.9830,'IPCC 2006 Guidelines for National GHG Inventories','2006', false),
  ('scope_1','Stationary Combustion','Furnace Oil','Liters',3.1540,'IPCC 2006 Guidelines for National GHG Inventories','2006', false),
  ('scope_1','Stationary Combustion','Coal','kg',2.4200,'IPCC 2006 Guidelines for National GHG Inventories','2006', false),
  ('scope_1','Stationary Combustion','CNG - Stationary','kg',2.7500,'IPCC 2006 Guidelines / GHG Protocol','2006', false),
  ('scope_1','Mobile Combustion','CNG - Vehicles','kg',2.6920,'India GHG Program - Road Transport Emission Factors','2015', false),
  ('scope_2','Purchased Electricity','Grid Electricity (India)','kWh',0.7117,'Central Electricity Authority (CEA) CO2 Baseline Database, Version 21.0','2025-11', false);
