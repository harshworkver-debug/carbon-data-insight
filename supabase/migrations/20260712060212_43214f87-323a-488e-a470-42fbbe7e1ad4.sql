
-- 1. Rewrite is_global_admin explicitly (admin + global_admin only)
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  RETURN public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'global_admin'::public.app_role);
END $$;

-- 2. Fix mutable search_path on the trigger function
CREATE OR REPLACE FUNCTION public.enforce_entry_edit_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.locked_at <= now() THEN
    RAISE EXCEPTION 'Entry % is locked (created more than 7 days ago). Submit a linked correction entry instead.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- 3. Revoke EXECUTE from anon/authenticated on SECURITY DEFINER helpers.
--    RLS policies invoke them internally as the table owner, so revoking
--    direct API execution does not break the app.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.current_user_company_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_scope(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_assigned_region() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_assigned_facility_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.facility_region(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.calculate_emission_for_entry() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_entry_edit_lock() FROM anon, authenticated, public;

-- 4. Add WITH CHECK to ghg_entries UPDATE policy to block scope reassignment
DROP POLICY IF EXISTS ghg_entries_update ON public.ghg_entries;
CREATE POLICY ghg_entries_update ON public.ghg_entries
FOR UPDATE
USING (
  public.can_access_scope(company_id, facility_id)
  AND locked_at > now()
  AND NOT public.has_role(auth.uid(), 'regional_director'::public.app_role)
)
WITH CHECK (
  public.can_access_scope(company_id, facility_id)
  AND locked_at > now()
  AND NOT public.has_role(auth.uid(), 'regional_director'::public.app_role)
);
