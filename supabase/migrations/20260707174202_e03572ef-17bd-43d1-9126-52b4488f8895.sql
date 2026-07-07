
-- Trigger functions don't need to be callable directly; revoke EXECUTE
-- so the security linter stops flagging them.
REVOKE EXECUTE ON FUNCTION public.calculate_emission_for_entry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_entry_edit_lock() FROM PUBLIC, anon, authenticated;
