import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/** A row from emission_factors used to populate the dropdown. */
type Factor = {
  id: string;
  scope: "scope_1" | "scope_2" | "scope_3";
  sub_type: string | null;
  unit: string;
  co2e_factor: number;
};

/** An entry joined with its calculated emission. */
type EntryRow = {
  id: string;
  entry_date: string;
  reporting_period: string;
  scope: string;
  sub_type: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
  co2e_kg: number | null;
  factor_available: boolean;
};

function fmtKg(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function monthLabel(period: string) {
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/**
 * Shared company data view.
 *
 * - When `readOnly` is true (admin auditor view), no entry form is shown.
 * - Otherwise a compact add-entry form appears above the totals & chart.
 */
export function CompanyData({
  companyId,
  readOnly = false,
}: {
  companyId: string;
  readOnly?: boolean;
}) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: f }, { data: e }] = await Promise.all([
        supabase
          .from("emission_factors")
          .select("id, scope, sub_type, unit, co2e_factor")
          .order("scope")
          .order("sub_type"),
        supabase
          .from("ghg_entries")
          .select(
            "id, entry_date, reporting_period, scope, sub_type, quantity, unit, notes, calculated_emissions(co2e_kg, factor_id_used)",
          )
          .eq("company_id", companyId)
          .order("entry_date", { ascending: false }),
      ]);
      if (!alive) return;
      setFactors((f ?? []) as Factor[]);
      const rows: EntryRow[] = ((e ?? []) as Array<{
        id: string;
        entry_date: string;
        reporting_period: string;
        scope: string;
        sub_type: string | null;
        quantity: number;
        unit: string;
        notes: string | null;
        calculated_emissions: Array<{ co2e_kg: number | null; factor_id_used: string | null }>;
      }>).map((r) => {
        const calc = r.calculated_emissions?.[0];
        return {
          id: r.id,
          entry_date: r.entry_date,
          reporting_period: r.reporting_period,
          scope: r.scope,
          sub_type: r.sub_type,
          quantity: Number(r.quantity),
          unit: r.unit,
          notes: r.notes,
          co2e_kg: calc?.co2e_kg == null ? null : Number(calc.co2e_kg),
          factor_available: !!calc?.factor_id_used,
        };
      });
      setEntries(rows);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [companyId, reloadTick]);

  // Totals
  const totalKg = useMemo(
    () => entries.reduce((s, r) => s + (r.co2e_kg ?? 0), 0),
    [entries],
  );
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthKg = useMemo(
    () =>
      entries
        .filter((r) => r.reporting_period === currentPeriod)
        .reduce((s, r) => s + (r.co2e_kg ?? 0), 0),
    [entries, currentPeriod],
  );
  const missingFactorCount = entries.filter((r) => !r.factor_available).length;

  // Chart data: last 12 months
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, 0);
    }
    for (const r of entries) {
      if (!map.has(r.reporting_period)) continue;
      map.set(r.reporting_period, (map.get(r.reporting_period) ?? 0) + (r.co2e_kg ?? 0));
    }
    return Array.from(map.entries()).map(([k, v]) => ({ month: monthLabel(k), kg: Number(v.toFixed(2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  return (
    <div className="space-y-8">
      {!readOnly && (
        <AddEntryCard
          companyId={companyId}
          factors={factors}
          onAdded={() => setReloadTick((t) => t + 1)}
        />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
        <Kpi label="Total emissions" value={`${fmtKg(totalKg)} kg CO₂e`} accent />
        <Kpi label="This month" value={`${fmtKg(thisMonthKg)} kg CO₂e`} />
        <Kpi
          label="Entries logged"
          value={`${entries.length}`}
          hint={
            missingFactorCount > 0
              ? `${missingFactorCount} awaiting a factor`
              : undefined
          }
        />
      </div>

      {/* Trend */}
      <section className="rounded-md border border-hairline bg-surface p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Monthly emissions (last 12 months)</h2>
          <span className="text-xs text-muted-foreground tabular">kg CO₂e</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={56} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-hairline)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-foreground)" }}
              />
              <Bar dataKey="kg" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Entry history */}
      <section className="rounded-md border border-hairline bg-surface">
        <header className="hairline-b px-6 py-4">
          <h2 className="text-sm font-semibold tracking-tight">Entry history</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Activity</th>
                <th className="px-6 py-3 font-medium text-right">Quantity</th>
                <th className="px-6 py-3 font-medium text-right">kg CO₂e</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-xs text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-xs text-muted-foreground">
                    No entries yet.
                  </td>
                </tr>
              )}
              {entries.map((r) => (
                <tr key={r.id} className="hairline-t">
                  <td className="px-6 py-3 tabular text-muted-foreground">{r.entry_date}</td>
                  <td className="px-6 py-3">{r.sub_type ?? "—"}</td>
                  <td className="px-6 py-3 tabular text-right">
                    {r.quantity.toLocaleString()} {r.unit}
                  </td>
                  <td className="px-6 py-3 tabular text-right">
                    {r.factor_available ? (
                      <span className="text-foreground">{fmtKg(r.co2e_kg)}</span>
                    ) : (
                      <span className="text-amber-400" title="No emission factor available for this activity yet.">
                        factor unavailable
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface p-6">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div
        className={
          "mt-2 text-2xl font-semibold tabular " +
          (accent ? "text-data-muted" : "text-foreground")
        }
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-amber-400 tabular">{hint}</div>}
    </div>
  );
}

function AddEntryCard({
  companyId,
  factors,
  onAdded,
}: {
  companyId: string;
  factors: Factor[];
  onAdded: () => void;
}) {
  const [factorId, setFactorId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selected = factors.find((f) => f.id === factorId);

  const hint = useMemo(() => {
    if (!selected) return "Choose the activity you're logging.";
    const u = selected.unit;
    if (u.toLowerCase() === "kwh") return "Enter the units (kWh) shown on your electricity bill.";
    if (u.toLowerCase() === "liters") return "Enter the volume in litres (as billed / metered).";
    if (u.toLowerCase() === "kg") return "Enter the quantity in kilograms.";
    return `Enter the quantity in ${u}.`;
  }, [selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selected) {
      setError("Choose an activity type.");
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Enter a positive quantity.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setError("Pick a month.");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSubmitting(false);
      setError("You are not signed in.");
      return;
    }
    const entryDate = `${period}-01`;
    const { error: insErr } = await supabase.from("ghg_entries").insert({
      company_id: companyId,
      entered_by: userData.user.id,
      scope: selected.scope,
      category: selected.scope === "scope_2" ? "Purchased Electricity" : "Combustion",
      sub_type: selected.sub_type,
      quantity: q,
      unit: selected.unit,
      entry_date: entryDate,
      reporting_period: period,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setSuccess("Entry saved.");
    setQuantity("");
    setNotes("");
    onAdded();
    setTimeout(() => setSuccess(null), 2500);
  }

  return (
    <section className="rounded-md border border-hairline bg-surface">
      <header className="hairline-b px-6 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Log activity data</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter what your facility actually consumed — we multiply by the government-issued factor.
        </p>
      </header>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>Activity type</Label>
          <select
            value={factorId}
            onChange={(e) => setFactorId(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select…</option>
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.scope === "scope_1" ? "Scope 1" : f.scope === "scope_2" ? "Scope 2" : "Scope 3"} · {f.sub_type} ({f.unit})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div>
          <Label>Quantity {selected ? `(${selected.unit})` : ""}</Label>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm tabular text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="0"
          />
          <p className="mt-1 text-xs text-muted-foreground">Numbers only — no commas or units.</p>
        </div>
        <div>
          <Label>Month</Label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm tabular text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">Reporting month for this activity.</p>
        </div>
        <div className="md:col-span-4">
          <Label>Notes (optional)</Label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Boiler #2, invoice INV-2033"
          />
        </div>
        <div className="md:col-span-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Add entry"}
          </button>
          {error && <span className="text-xs text-destructive">{error}</span>}
          {success && <span className="text-xs text-data-muted">{success}</span>}
          {selected && (
            <span className="ml-auto text-xs text-muted-foreground tabular">
              Factor: {selected.co2e_factor} kg CO₂e / {selected.unit}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs uppercase tracking-wider text-muted-foreground">{children}</label>
  );
}
