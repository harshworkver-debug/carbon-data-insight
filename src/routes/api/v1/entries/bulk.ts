// Automated ingestion endpoint for ERP/SAP-style bulk uploads.
// Auth: Bearer <raw api key>  — validated against api_keys.hashed_key (sha256 hex).
// Payload: { entries: [{ facility_id, reporting_month, scope, category, source_type, quantity, unit }] }
// Insert straight into ghg_entries; the DB trigger populates calculated_emissions.
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

const EntrySchema = z.object({
  facility_id: z.string().uuid(),
  reporting_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  scope: z.enum(["Scope 1", "Scope 2", "Scope 3", "scope_1", "scope_2", "scope_3"]),
  category: z.string().min(1),
  source_type: z.string().min(1),
  quantity: z.number().positive().finite(),
  unit: z.string().min(1),
  notes: z.string().optional(),
});

const PayloadSchema = z.object({
  entries: z.array(EntrySchema).min(1).max(500),
});

type ScopeEnum = "scope_1" | "scope_2" | "scope_3";
const SCOPE_MAP: Record<string, ScopeEnum> = {
  "Scope 1": "scope_1",
  "Scope 2": "scope_2",
  "Scope 3": "scope_3",
  scope_1: "scope_1",
  scope_2: "scope_2",
  scope_3: "scope_3",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// kWh <-> MWh normalization matched to the emission factor's unit.
function normalizeQuantity(qty: number, submitted: string, factorUnit: string): number {
  const s = submitted.toLowerCase();
  const f = factorUnit.toLowerCase();
  if (s === f) return qty;
  if (s === "kwh" && f === "mwh") return qty / 1000;
  if (s === "mwh" && f === "kwh") return qty * 1000;
  return qty;
}

export const Route = createFileRoute("/api/v1/entries/bulk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const m = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!m) return json({ error: "Missing bearer token" }, 401);
        const rawKey = m[1].trim();
        const hashed = createHash("sha256").update(rawKey).digest("hex");

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = PayloadSchema.safeParse(payload);
        if (!parsed.success) {
          return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Validate the token
        const { data: keyRow, error: keyErr } = await supabaseAdmin
          .from("api_keys")
          .select("id, company_id")
          .eq("hashed_key", hashed)
          .maybeSingle();
        if (keyErr) return json({ error: "Token validation failed" }, 500);
        if (!keyRow) return json({ error: "Invalid API key" }, 401);

        // 2. Fetch allowed facilities for this company (single round-trip)
        const facilityIds = Array.from(new Set(parsed.data.entries.map((e) => e.facility_id)));
        const { data: allowedFacilities, error: fErr } = await supabaseAdmin
          .from("facilities")
          .select("id")
          .eq("company_id", keyRow.company_id)
          .in("id", facilityIds);
        if (fErr) return json({ error: "Facility check failed" }, 500);
        const allowed = new Set((allowedFacilities ?? []).map((f) => f.id));
        const invalid = facilityIds.filter((id) => !allowed.has(id));
        if (invalid.length) {
          return json(
            { error: "Facility does not belong to this API key's company", invalid_facility_ids: invalid },
            403,
          );
        }

        // 3. Preload factors for unit normalization
        const { data: factors } = await supabaseAdmin
          .from("emission_factors")
          .select("scope, sub_type, unit");
        const factorUnitBy = new Map<string, string>();
        (factors ?? []).forEach((f) => {
          if (f.sub_type) factorUnitBy.set(`${f.scope}::${f.sub_type}`, f.unit);
        });

        // 4. Build rows and insert
        // System-owned attribution for ingestion: use the API key creator if set,
        // else a stable sentinel is not available — fall back to the api_keys.id.
        const { data: keyMeta } = await supabaseAdmin
          .from("api_keys")
          .select("created_by")
          .eq("id", keyRow.id)
          .maybeSingle();
        const enteredBy = keyMeta?.created_by ?? null;
        if (!enteredBy) {
          return json(
            { error: "API key has no owning user; regenerate via the admin console." },
            409,
          );
        }

        const rows = parsed.data.entries.map((e) => {
          const scope = SCOPE_MAP[e.scope];
          const factorUnit = factorUnitBy.get(`${scope}::${e.source_type}`) ?? e.unit;
          const qty = normalizeQuantity(e.quantity, e.unit, factorUnit);
          const entryDate = e.reporting_month.length === 7 ? `${e.reporting_month}-01` : e.reporting_month;
          return {
            company_id: keyRow.company_id,
            facility_id: e.facility_id,
            entered_by: enteredBy,
            scope,
            category: e.category,
            sub_type: e.source_type,
            quantity: qty,
            unit: factorUnit,
            entry_date: entryDate,
            reporting_period: entryDate.slice(0, 7),
            notes: e.notes ?? "Bulk API ingest",
          };
        });

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("ghg_entries")
          .insert(rows)
          .select("id");
        if (insErr) return json({ error: insErr.message }, 500);

        await supabaseAdmin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id);

        return json({ ok: true, ingested: inserted?.length ?? 0, ids: inserted?.map((r) => r.id) ?? [] });
      },

      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "authorization, content-type",
          },
        }),
    },
  },
});
