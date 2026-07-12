
CREATE OR REPLACE FUNCTION public.is_global_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'global_admin'::public.app_role);
END $function$;

CREATE OR REPLACE FUNCTION public.can_access_scope(_company_id uuid, _facility_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  v_company := public.current_user_company_id();
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
END $function$;
