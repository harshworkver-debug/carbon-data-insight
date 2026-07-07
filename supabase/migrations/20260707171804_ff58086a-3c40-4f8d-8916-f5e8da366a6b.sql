
-- Restrict company creation: only allowed if the user doesn't already have one
DROP POLICY "Authenticated users can create companies" ON public.companies;
CREATE POLICY "Users without a company can create one"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (public.current_user_company_id() IS NULL);

-- Revoke public/anon EXECUTE on security-definer functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
