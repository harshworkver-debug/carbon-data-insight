import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ShieldAlert, Plus, Save, Trash2, ExternalLink, Copy, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Scope = Database["public"]["Enums"]["ghg_scope"];

type Factor = {
  id: string;
  scope: Scope;
  category: string;
  sub_type: string | null;
  unit: string;
  co2e_factor: number;
  is_proxy_data: boolean;
  source: string | null;
  version_year: string | null;
};

type Company = {
  id: string;
  name: string;
  location: string | null;
  industry_type: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setChecked(true);
        return;
      }
      setUserId(data.user.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
      setChecked(true);
    })();
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center">
        <div className="text-sm text-muted-foreground">Verifying clearance…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center px-6">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <div className="mt-4 text-xs uppercase tracking-[0.2em] text-data-muted">
            403 — Restricted
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Access Denied — Regulatory Clearance Required
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This console is restricted to administrators. If you believe you should have access,
            contact your compliance lead.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-elevated"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Return to workspace
          </Link>
        </div>
      </div>
    );
  }

  return <AdminConsole userId={userId!} />;
}

function AdminConsole({ userId: _userId }: { userId: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Workspace
            </Link>
            <span className="text-hairline text-muted-foreground">/</span>
            <span className="text-sm font-semibold tracking-tight">Administrative Portal</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
        <section>
          <SectionHeader
            eyebrow="Tenants"
            title="Multi-Tenant Overview"
            description="Every registered client facility. Click a row to enter Auditor View."
          />
          <CompaniesTable />
        </section>

        <section>
          <SectionHeader
            eyebrow="Ledger"
            title="Emission Factor Control Console"
            description="Update coefficients, toggle proxy status, or declare a new fuel sub-type."
          />
          <FactorsConsole />
        </section>

        <section>
          <SectionHeader
            eyebrow="Provisioning"
            title="Register a New Facility"
            description="Add a supplier company to the ledger."
          />
          <ProvisionForm />
        </section>

        <section>
          <SectionHeader
            eyebrow="Hierarchy"
            title="Facilities & Regional Assignments"
            description="Provision physical facilities and bind them to regional directors or plant managers."
          />
          <FacilitiesConsole />
        </section>

        <section>
          <SectionHeader
            eyebrow="Integration"
            title="ERP API Keys"
            description="Generate tokens for automated ingestion at POST /api/v1/entries/bulk. Tokens are shown once — copy them immediately."
          />
          <ApiKeysConsole />
        </section>
      </main>
    </div>
  );
}


function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-data-muted">{eyebrow}</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Companies
function CompaniesTable() {
  const q = useQuery({
    queryKey: ["admin_companies"],
    queryFn: async () => {
      const [{ data: companies, error: cErr }, { data: emissions, error: eErr }, { data: entries, error: entErr }] =
        await Promise.all([
          supabase.from("companies").select("id, name, location, industry_type, created_at"),
          supabase.from("calculated_emissions").select("company_id, co2e_kg"),
          supabase.from("ghg_entries").select("company_id, entry_date"),
        ]);
      if (cErr) throw cErr;
      if (eErr) throw eErr;
      if (entErr) throw entErr;
      const totals = new Map<string, number>();
      (emissions ?? []).forEach((r: { company_id: string; co2e_kg: number }) =>
        totals.set(r.company_id, (totals.get(r.company_id) ?? 0) + Number(r.co2e_kg)),
      );
      const lastActivity = new Map<string, string>();
      (entries ?? []).forEach((r: { company_id: string; entry_date: string }) => {
        const cur = lastActivity.get(r.company_id);
        if (!cur || r.entry_date > cur) lastActivity.set(r.company_id, r.entry_date);
      });
      return (companies as Company[]).map((c) => ({
        ...c,
        total_kg: totals.get(c.id) ?? 0,
        last_activity: lastActivity.get(c.id) ?? null,
      }));
    },
  });

  const rows = q.data ?? [];

  return (
    <div className="overflow-x-auto rounded-md border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wider text-data-muted">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Industry</th>
            <th className="px-3 py-2 text-right font-medium">Cumulative (t CO₂e)</th>
            <th className="px-3 py-2 font-medium">Last Activity</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {q.isLoading ? "Loading tenants…" : "No companies registered."}
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr
              key={c.id}
              className="border-b border-hairline last:border-b-0 hover:bg-surface-elevated/60"
            >
              <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.location ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.industry_type ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular text-foreground">
                {(c.total_kg / 1000).toFixed(3)}
              </td>
              <td className="px-3 py-2 tabular text-muted-foreground">
                {c.last_activity ?? "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  to="/admin/company/$id"
                  params={{ id: c.id }}
                  className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-elevated px-2 py-1 text-xs text-foreground hover:bg-accent"
                >
                  Auditor View
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Factors
function FactorsConsole() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin_factors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emission_factors")
        .select("id, scope, category, sub_type, unit, co2e_factor, is_proxy_data, source, version_year")
        .order("scope")
        .order("category")
        .order("sub_type");
      if (error) throw error;
      return (data ?? []) as Factor[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, Partial<Factor>>>({});
  const factors = q.data ?? [];

  function setDraft(id: string, patch: Partial<Factor>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function saveRow(f: Factor) {
    const patch = drafts[f.id];
    if (!patch) return;
    const { error } = await supabase
      .from("emission_factors")
      .update(patch)
      .eq("id", f.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Factor updated.");
    setDrafts((d) => {
      const n = { ...d };
      delete n[f.id];
      return n;
    });
    qc.invalidateQueries({ queryKey: ["admin_factors"] });
    qc.invalidateQueries({ queryKey: ["emission_factors"] });
    qc.invalidateQueries({ queryKey: ["emission_factors_all"] });
  }

  async function deleteRow(f: Factor) {
    if (!confirm(`Delete factor "${f.sub_type ?? f.category}"?`)) return;
    const { error } = await supabase.from("emission_factors").delete().eq("id", f.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Factor deleted.");
    qc.invalidateQueries({ queryKey: ["admin_factors"] });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-hairline bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wider text-data-muted">
              <th className="px-3 py-2 font-medium">Scope</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Sub-Type</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 text-right font-medium">Coefficient (kg CO₂e / unit)</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 text-center font-medium">Proxy</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {factors.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {q.isLoading ? "Loading factors…" : "No factors."}
                </td>
              </tr>
            )}
            {factors.map((f) => {
              const draft = drafts[f.id] ?? {};
              const dirty = Object.keys(draft).length > 0;
              return (
                <tr key={f.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {f.scope.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{f.category}</td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <Input
                      value={draft.sub_type ?? f.sub_type ?? ""}
                      onChange={(e) => setDraft(f.id, { sub_type: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2 w-[90px]">
                    <Input
                      value={draft.unit ?? f.unit}
                      onChange={(e) => setDraft(f.id, { unit: e.target.value })}
                      className="h-8 tabular"
                    />
                  </td>
                  <td className="px-3 py-2 w-[160px]">
                    <Input
                      type="number"
                      step="any"
                      value={draft.co2e_factor ?? f.co2e_factor}
                      onChange={(e) =>
                        setDraft(f.id, { co2e_factor: Number(e.target.value) })
                      }
                      className="h-8 text-right tabular"
                    />
                  </td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <Input
                      value={draft.source ?? f.source ?? ""}
                      onChange={(e) => setDraft(f.id, { source: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2 w-[90px]">
                    <Input
                      value={draft.version_year ?? f.version_year ?? ""}
                      onChange={(e) => setDraft(f.id, { version_year: e.target.value })}
                      className="h-8 tabular"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Switch
                      checked={draft.is_proxy_data ?? f.is_proxy_data}
                      onCheckedChange={(v) => setDraft(f.id, { is_proxy_data: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dirty}
                        onClick={() => saveRow(f)}
                        className="h-7 gap-1 border-hairline"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRow(f)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NewFactorForm />
    </div>
  );
}

function NewFactorForm() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("scope_1");
  const [category, setCategory] = useState("");
  const [subType, setSubType] = useState("");
  const [unit, setUnit] = useState("");
  const [coef, setCoef] = useState("");
  const [source, setSource] = useState("");
  const [year, setYear] = useState("");
  const [proxy, setProxy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("emission_factors").insert({
      scope,
      category,
      sub_type: subType || null,
      unit,
      co2e_factor: Number(coef),
      source: source || null,
      version_year: year || null,
      is_proxy_data: proxy,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New emission factor added.");
    setCategory("");
    setSubType("");
    setUnit("");
    setCoef("");
    setSource("");
    setYear("");
    setProxy(false);
    qc.invalidateQueries({ queryKey: ["admin_factors"] });
    qc.invalidateQueries({ queryKey: ["emission_factors"] });
    qc.invalidateQueries({ queryKey: ["emission_factors_all"] });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-hairline bg-surface p-4"
    >
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-data-muted">
        <Plus className="h-3.5 w-3.5" />
        Declare new factor
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="scope_1">Scope 1</SelectItem>
            <SelectItem value="scope_2">Scope 2</SelectItem>
            <SelectItem value="scope_3">Scope 3</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Category" required value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input placeholder="Sub-type" value={subType} onChange={(e) => setSubType(e.target.value)} />
        <Input placeholder="Unit (e.g. litre, kWh)" required value={unit} onChange={(e) => setUnit(e.target.value)} />
        <Input placeholder="Coefficient (kg CO₂e/unit)" required type="number" step="any" value={coef} onChange={(e) => setCoef(e.target.value)} className="tabular" />
        <Input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
        <Input placeholder="Version year" value={year} onChange={(e) => setYear(e.target.value)} className="tabular" />
        <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-background px-3">
          <span className="text-xs text-muted-foreground">Proxy data</span>
          <Switch checked={proxy} onCheckedChange={setProxy} />
        </div>
      </div>
      <div className="mt-4">
        <Button type="submit" disabled={busy} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          {busy ? "Adding…" : "Add factor"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Provisioning
function ProvisionForm() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("companies").insert({
      name,
      industry_type: industry || null,
      location: location || null,
      contact_person: contactPerson || null,
      contact_email: contactEmail || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Facility registered.");
    setName("");
    setIndustry("");
    setLocation("");
    setContactPerson("");
    setContactEmail("");
    qc.invalidateQueries({ queryKey: ["admin_companies"] });
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-hairline bg-surface p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldLabel label="Company name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Manufacturing Pvt Ltd" />
        </FieldLabel>
        <FieldLabel label="Industry classification">
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Pharmaceuticals / NIC 21001" />
        </FieldLabel>
        <FieldLabel label="Regional factory hub">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Baddi, HP" />
        </FieldLabel>
        <FieldLabel label="Primary contact">
          <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Priya Sharma" />
        </FieldLabel>
        <FieldLabel label="Contact email">
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ops@acme.co" />
        </FieldLabel>
      </div>
      <div className="mt-5">
        <Button type="submit" disabled={busy} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          {busy ? "Registering…" : "Register facility"}
        </Button>
      </div>
    </form>
  );
}

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

