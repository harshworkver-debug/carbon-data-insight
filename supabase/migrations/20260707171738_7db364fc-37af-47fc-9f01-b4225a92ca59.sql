
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.ghg_scope AS ENUM ('scope_1', 'scope_2', 'scope_3');

-- Companies
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  industry_type TEXT,
  location TEXT,
  contact_email TEXT,
  contact_person TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper to get current user's company_id (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Emission factors
CREATE TABLE public.emission_factors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope public.ghg_scope NOT NULL,
  category TEXT NOT NULL,
  sub_type TEXT,
  unit TEXT NOT NULL,
  co2e_factor NUMERIC NOT NULL,
  source TEXT,
  version_year TEXT,
  verified_date DATE,
  is_proxy_data BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT ON public.emission_factors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.emission_factors TO authenticated;
GRANT ALL ON public.emission_factors TO service_role;
ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;

-- GHG entries
CREATE TABLE public.ghg_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entered_by UUID NOT NULL REFERENCES auth.users(id),
  scope public.ghg_scope NOT NULL,
  category TEXT NOT NULL,
  sub_type TEXT,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  entry_date DATE NOT NULL,
  reporting_period TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  corrects_entry_id UUID REFERENCES public.ghg_entries(id),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghg_entries TO authenticated;
GRANT ALL ON public.ghg_entries TO service_role;
ALTER TABLE public.ghg_entries ENABLE ROW LEVEL SECURITY;

-- Calculated emissions
CREATE TABLE public.calculated_emissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.ghg_entries(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  co2e_kg NUMERIC NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  factor_id_used UUID REFERENCES public.emission_factors(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculated_emissions TO authenticated;
GRANT ALL ON public.calculated_emissions TO service_role;
ALTER TABLE public.calculated_emissions ENABLE ROW LEVEL SECURITY;

-- RLS: companies
CREATE POLICY "Users can view their own company"
ON public.companies FOR SELECT TO authenticated
USING (id = public.current_user_company_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can create companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update their own company"
ON public.companies FOR UPDATE TO authenticated
USING (id = public.current_user_company_id() OR public.has_role(auth.uid(), 'admin'));

-- RLS: profiles
CREATE POLICY "Users can view profiles in their company"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR company_id = public.current_user_company_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid());

-- RLS: user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: emission_factors
CREATE POLICY "All authenticated users can read emission factors"
ON public.emission_factors FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert emission factors"
ON public.emission_factors FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update emission factors"
ON public.emission_factors FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete emission factors"
ON public.emission_factors FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: ghg_entries
CREATE POLICY "Users can view their company's entries"
ON public.ghg_entries FOR SELECT TO authenticated
USING (company_id = public.current_user_company_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert entries for their company"
ON public.ghg_entries FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_user_company_id() AND entered_by = auth.uid());

CREATE POLICY "Users can update unlocked entries in their company"
ON public.ghg_entries FOR UPDATE TO authenticated
USING (company_id = public.current_user_company_id() AND locked_at > now());

-- RLS: calculated_emissions
CREATE POLICY "Users can view their company's calculated emissions"
ON public.calculated_emissions FOR SELECT TO authenticated
USING (company_id = public.current_user_company_id() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert calculated emissions for their company"
ON public.calculated_emissions FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_user_company_id());

-- Auto-create profile + user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
