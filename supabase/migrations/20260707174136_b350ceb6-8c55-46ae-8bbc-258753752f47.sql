
-- Calculation engine + edit-lock enforcement for GHG entries.

-- 1. Calculation trigger: on INSERT into ghg_entries, look up the matching
--    emission_factor by (scope, sub_type). Apply the kWh→MWh unit conversion
--    for grid electricity when the user entered kWh but the factor is per MWh.
--    Always write a row into calculated_emissions; when no factor matches,
--    write factor_id_used = NULL and co2e_kg = 0 so the entry is flagged
--    "unlinked" for later review rather than silently dropped.
CREATE OR REPLACE FUNCTION public.calculate_emission_for_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factor RECORD;
  v_qty NUMERIC;
  v_co2e NUMERIC;
BEGIN
  SELECT id, unit, co2e_factor
    INTO v_factor
    FROM public.emission_factors
   WHERE scope = NEW.scope
     AND sub_type = NEW.sub_type
   LIMIT 1;

  IF v_factor.id IS NULL THEN
    INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg)
    VALUES (NEW.company_id, NEW.id, NULL, 0);
    RETURN NEW;
  END IF;

  v_qty := NEW.quantity;

  -- Unit conversion: users typically read kWh off their utility bill,
  -- but the grid factor is per MWh. Convert automatically.
  IF lower(v_factor.unit) = 'mwh' AND lower(NEW.unit) = 'kwh' THEN
    v_qty := v_qty / 1000.0;
  ELSIF lower(v_factor.unit) = 'kwh' AND lower(NEW.unit) = 'mwh' THEN
    v_qty := v_qty * 1000.0;
  END IF;

  v_co2e := v_qty * v_factor.co2e_factor;

  INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg)
  VALUES (NEW.company_id, NEW.id, v_factor.id, v_co2e);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the entry insert; flag as unlinked for review.
  INSERT INTO public.calculated_emissions (company_id, entry_id, factor_id_used, co2e_kg)
  VALUES (NEW.company_id, NEW.id, NULL, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_emission_for_entry ON public.ghg_entries;
CREATE TRIGGER trg_calculate_emission_for_entry
AFTER INSERT ON public.ghg_entries
FOR EACH ROW EXECUTE FUNCTION public.calculate_emission_for_entry();

-- 2. Enforce 7-day edit lock at the database level: block UPDATE / DELETE
--    on a locked entry even if RLS is somehow bypassed (e.g. service role).
CREATE OR REPLACE FUNCTION public.enforce_entry_edit_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_at <= now() THEN
    RAISE EXCEPTION 'Entry % is locked (created more than 7 days ago). Submit a linked correction entry instead.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_entry_edit_lock ON public.ghg_entries;
CREATE TRIGGER trg_enforce_entry_edit_lock
BEFORE UPDATE OR DELETE ON public.ghg_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_entry_edit_lock();

-- 3. DELETE RLS policy mirroring the existing UPDATE gate.
DROP POLICY IF EXISTS "Users can delete unlocked entries in their company" ON public.ghg_entries;
CREATE POLICY "Users can delete unlocked entries in their company"
ON public.ghg_entries
FOR DELETE
TO authenticated
USING (company_id = current_user_company_id() AND locked_at > now());
