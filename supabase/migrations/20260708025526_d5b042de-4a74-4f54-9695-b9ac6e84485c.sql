-- Allow admins to provision new companies from the admin console.
DROP POLICY IF EXISTS "Users without a company can create one" ON public.companies;

CREATE POLICY "Users without a company can create one"
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_company_id() IS NULL
    OR has_role(auth.uid(), 'admin'::app_role)
  );