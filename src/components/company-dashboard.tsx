import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, ChevronDown, Filter, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type RangeKey = "month" | "quarter" | "fy" | "custom";

type Entry = {
  id: string;
  entry_date: string;
  reporting_period: string;
  scope: "scope_1" | "scope_2" | "scope_3";
  sub_type: string | null;
  category: string;
  quantity: number;
  unit: string;
};
type Calc = {
  entry_id: string;
  co2e_kg: number;
  factor_id_used: string | null;
};
type Factor = {
  id: string;
  sub_type: string | null;
  source: string | null;
  version_year: string | null;
  is_proxy_data: boolean;
};

const SCOPE_COLORS = {
  scope_1: "oklch(0.64 0.075 175)",
  scope_2: "oklch(0.55 0.055 175)",
  scope_3: "oklch(0.40 0.04 175)",
} as const;

const SCOPE_LABEL = {
  scope_1: "Scope 1",
  scope_2: "Scope 2",
  scope_3: "Scope 3",
} as const;

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getRange(key: RangeKey, custom: { from: string; to: string }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "month") {
    return {
      from: fmtDate(new Date(y, m, 1)),
      to: fmtDate(new Date(y, m + 1, 0)),
    };
  }
  if (key === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return {
      from: fmtDate(new Date(y, qStart, 1)),
      to: fmtDate(new Date(y, qStart + 3, 0)),
    };
  }
  if (key === "fy") {
    // Apr - Mar
    const fyStart = m >= 3 ? y : y - 1;
    return {
      from: `${fyStart}-04-01`,
      to: `${fyStart + 1}-03-31`,
    };
  }
  return { from: custom.from, to: custom.to };
}

export function CompanyDashboard({
  companyId,
  companyName,
  auditor = false,
}: {
  companyId: string;
  companyName: string;
  auditor?: boolean;
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("fy");
  const [custom, setCustom] = useState({
    from: fmtDate(new Date(new Date().getFullYear(), 0, 1)),
    to: fmtDate(new Date()),
  });
  const range = getRange(rangeKey, custom);

  const factorsQ = useQuery({
    queryKey: ["emission_factors_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emission_factors")
        .select("id, sub_type, source, version_year, is_proxy_data");
      if (error) throw error;
      return (data ?? []) as Factor[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["ghg_entries", companyId, range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ghg_entries")
        .select("id, entry_date, reporting_period, scope, sub_type, category, quantity, unit")
        .eq("company_id", companyId)
        .gte("entry_date", range.from)
        .lte("entry_date", range.to)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const calcQ = useQuery({
    queryKey: ["calc_emissions", companyId, range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calculated_emissions")
        .select("entry_id, co2e_kg, factor_id_used")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Calc[];
    },
  });

  const factorById = useMemo(() => {
    const m = new Map<string, Factor>();
    (factorsQ.data ?? []).forEach((f) => m.set(f.id, f));
    return m;
  }, [factorsQ.data]);

  const calcByEntry = useMemo(() => {
    const m = new Map<string, Calc>();
    (calcQ.data ?? []).forEach((c) => m.set(c.entry_id, c));
    return m;
  }, [calcQ.data]);

  const entries = entriesQ.data ?? [];

  const rows = useMemo(
    () =>
      entries.map((e) => {
        const c = calcByEntry.get(e.id);
        const factor = c?.factor_id_used ? factorById.get(c.factor_id_used) : null;
        return {
          entry: e,
          co2e_kg: c?.co2e_kg ?? 0,
          factor,
          isProxy: factor?.is_proxy_data ?? false,
        };
      }),
    [entries, calcByEntry, factorById],
  );

  const totals = useMemo(() => {
    let total = 0;
    const byScope = { scope_1: 0, scope_2: 0, scope_3: 0 };
    let proxyKg = 0;
    let nonProxyKg = 0;
    rows.forEach((r) => {
      total += r.co2e_kg;
      byScope[r.entry.scope] += r.co2e_kg;
      if (r.factor) {
        if (r.isProxy) proxyKg += r.co2e_kg;
        else nonProxyKg += r.co2e_kg;
      }
    });
    const classified = proxyKg + nonProxyKg;
    const quality = classified > 0 ? (nonProxyKg / classified) * 100 : 0;
    return { total, byScope, quality, count: rows.length };
  }, [rows]);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.entry.reporting_period;
      map.set(k, (map.get(k) ?? 0) + r.co2e_kg);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, kg]) => ({ period, tons: kg / 1000 }));
  }, [rows]);

  const donutData = [
    { name: "Scope 1", value: totals.byScope.scope_1, key: "scope_1" as const },
    { name: "Scope 2", value: totals.byScope.scope_2, key: "scope_2" as const },
    { name: "Scope 3", value: totals.byScope.scope_3, key: "scope_3" as const },
  ].filter((d) => d.value > 0);

  const loading = entriesQ.isLoading || calcQ.isLoading || factorsQ.isLoading;

  return (
    <div className="print-area">
      {/* Print-only report header */}
      <div className="hidden print:block mb-6">
        <div className="text-xs uppercase tracking-[0.2em]">Carbon Control — Compliance Report</div>
        <h1 className="mt-1 text-xl font-semibold">{companyName}</h1>
        <div className="mt-1 text-xs">
          Reporting window: {range.from} → {range.to} · Generated {new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {/* Control bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["month", "Current Month"],
              ["quarter", "Current Quarter"],
              ["fy", "FY (Apr–Mar)"],
              ["custom", "Custom"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRangeKey(k)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (rangeKey === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated")
              }
            >
              {label}
            </button>
          ))}
          {rangeKey === "custom" && (
            <div className="ml-2 flex items-center gap-2">
              <Input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((s) => ({ ...s, from: e.target.value }))}
                className="h-8 w-[140px] tabular"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((s) => ({ ...s, to: e.target.value }))}
                className="h-8 w-[140px] tabular"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs tabular text-data-muted">
            {range.from} → {range.to}
          </div>
          {!auditor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 border-hairline"
            >
              <Printer className="h-3.5 w-3.5" />
              Export Compliance Report
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi
          label="Total Gross Footprint"
          value={(totals.total / 1000).toFixed(3)}
          unit="t CO₂e"
          hint={`${totals.total.toFixed(1)} kg CO₂e`}
        />
        <Kpi
          label="Data Quality Score"
          value={totals.quality.toFixed(1)}
          unit="%"
          hint="CEA/IPCC verified vs. proxy factors"
        />
        <Kpi
          label="Active Entries"
          value={String(totals.count)}
          unit="submissions"
          hint="Within the selected reporting window"
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Emissions by Scope">
          {donutData.length === 0 ? (
            <EmptyChart loading={loading} />
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-[220px] w-[220px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={62}
                      outerRadius={92}
                      stroke="var(--color-background)"
                      strokeWidth={2}
                      isAnimationActive={false}
                      cornerRadius={0}
                    >
                      {donutData.map((d) => (
                        <Cell key={d.key} fill={SCOPE_COLORS[d.key]} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={{
                        background: "var(--color-surface-elevated)",
                        border: "1px solid var(--color-hairline)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => `${(v / 1000).toFixed(3)} t CO₂e`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {(["scope_1", "scope_2", "scope_3"] as const).map((k) => {
                  const v = totals.byScope[k];
                  const pct = totals.total > 0 ? (v / totals.total) * 100 : 0;
                  return (
                    <div key={k} className="flex items-center justify-between gap-4 border-b border-hairline pb-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2"
                          style={{ background: SCOPE_COLORS[k] }}
                        />
                        <span className="text-muted-foreground">{SCOPE_LABEL[k]}</span>
                      </div>
                      <div className="tabular">
                        <span className="text-foreground">{(v / 1000).toFixed(3)}</span>
                        <span className="ml-1 text-xs text-data-muted">t</span>
                        <span className="ml-3 text-xs text-data-muted">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Monthly Trend">
          {monthly.length === 0 ? (
            <EmptyChart loading={loading} />
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--color-hairline)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--color-hairline)" }}
                    tickLine={false}
                    width={48}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "var(--color-surface-elevated)",
                      border: "1px solid var(--color-hairline)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => `${v.toFixed(3)} t CO₂e`}
                  />
                  <Line
                    type="linear"
                    dataKey="tons"
                    stroke="var(--color-primary)"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, fill: "var(--color-primary)", strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* Ledger */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Audit Ledger</h2>
          <span className="text-xs text-data-muted tabular">{rows.length} entries</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-hairline bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wider text-data-muted">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Sub-Type</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">t CO₂e</th>
                <th className="px-3 py-2 font-medium">Source Factor</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading ledger…" : "No entries in this window."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.entry.id} className="border-b border-hairline last:border-b-0 hover:bg-surface-elevated/60">
                  <td className="px-3 py-2 tabular text-muted-foreground">{r.entry.entry_date}</td>
                  <td className="px-3 py-2 tabular text-muted-foreground">{r.entry.reporting_period}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-foreground">{SCOPE_LABEL[r.entry.scope]}</span>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.entry.sub_type ?? r.entry.category}</span>
                      {r.isProxy && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium uppercase tracking-wider text-amber-300"
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          International Proxy
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-foreground">
                    {r.entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    <span className="ml-1 text-xs text-data-muted">{r.entry.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-foreground">
                    {(r.co2e_kg / 1000).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.factor ? (
                      <>
                        <span>{r.factor.source ?? "—"}</span>
                        {r.factor.version_year && (
                          <span className="ml-1 text-data-muted">({r.factor.version_year})</span>
                        )}
                      </>
                    ) : (
                      <span className="text-destructive">Unlinked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print-only methodology & scope recap */}
      <div className="print-only mt-8 text-xs">
        <h2 className="text-sm font-semibold">Scope Distribution</h2>
        <table className="mt-2 w-full">
          <thead>
            <tr>
              <th className="text-left">Scope</th>
              <th className="text-right">t CO₂e</th>
              <th className="text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {(["scope_1", "scope_2", "scope_3"] as const).map((k) => {
              const v = totals.byScope[k];
              const pct = totals.total > 0 ? (v / totals.total) * 100 : 0;
              return (
                <tr key={k}>
                  <td>{SCOPE_LABEL[k]}</td>
                  <td className="text-right tabular">{(v / 1000).toFixed(3)}</td>
                  <td className="text-right tabular">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Total</strong></td>
              <td className="text-right tabular"><strong>{(totals.total / 1000).toFixed(3)}</strong></td>
              <td className="text-right tabular"><strong>100.0%</strong></td>
            </tr>
          </tbody>
        </table>

        <h2 className="mt-6 text-sm font-semibold">Methodology & References</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>GHG accounting follows the <strong>GHG Protocol Corporate Standard</strong> (Scopes 1, 2, and 3) with operational-control boundaries.</li>
          <li>Scope 1 stationary and mobile combustion factors: <strong>IPCC 2006 Guidelines, Vol. 2 (Energy)</strong>.</li>
          <li>Scope 1 refrigerant GWP values: <strong>IPCC AR5 (100-yr)</strong>.</li>
          <li>Scope 2 grid electricity: <strong>CEA CO₂ Baseline Database for the Indian Power Sector v20 (weighted average, 0.7117 t CO₂/MWh)</strong>.</li>
          <li>Scope 3 travel, freight, water and waste factors: <strong>UK DEFRA 2025/2026 GHG Conversion Factors</strong> (used as international proxy pending India-specific verification; flagged in the ledger as <em>International Proxy</em>).</li>
          <li>Entries lock 7 days after creation; changes thereafter are recorded as linked correction entries to preserve the audit trail.</li>
        </ul>
        <div className="mt-4 text-[10px]">
          This report was generated by Carbon Control on {new Date().toISOString().slice(0, 10)}. Values are calculated at ingest and stored immutably alongside the source factor reference.
        </div>
      </div>
    </div>
  );
}


function Kpi({ label, value, unit, hint }: { label: string; value: string; unit: string; hint?: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-data-muted">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-semibold tabular tracking-tight text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground">{unit}</div>
      </div>
      {hint && <div className="mt-2 text-xs text-data-muted">{hint}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-5">
      <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-data-muted">{title}</div>
      {children}
    </div>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="grid h-[220px] place-items-center text-sm text-muted-foreground">
      {loading ? "Loading…" : "No data in this window."}
    </div>
  );
}
