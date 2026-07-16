import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Carbon Clarity" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminHome,
});

type CompanyRow = {
  id: string;
  name: string;
  contact_email: string | null;
  location: string | null;
  industry_type: string | null;
  created_at: string;
  total_kg: number;
  last_entry: string | null;
};

function AdminHome() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "denied" | "ok">("loading");
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setStatus("denied");
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r) => r.role === "admin")) {
        setStatus("denied");
        return;
      }

      const [{ data: comps }, { data: calcs }, { data: entries }] = await Promise.all([
        supabase.from("companies").select("*").order("name"),
        supabase.from("calculated_emissions").select("company_id, co2e_kg"),
        supabase
          .from("ghg_entries")
          .select("company_id, entry_date")
          .order("entry_date", { ascending: false }),
      ]);

      const totals = new Map<string, number>();
      (calcs ?? []).forEach((r) => {
        const v = Number(r.co2e_kg ?? 0);
        totals.set(r.company_id, (totals.get(r.company_id) ?? 0) + v);
      });
      const lastEntry = new Map<string, string>();
      (entries ?? []).forEach((r) => {
        if (!lastEntry.has(r.company_id)) lastEntry.set(r.company_id, r.entry_date);
      });

      const rows: CompanyRow[] = ((comps ?? []) as Array<{
        id: string;
        name: string;
        contact_email: string | null;
        location: string | null;
        industry_type: string | null;
        created_at: string;
      }>).map((c) => ({
        ...c,
        total_kg: totals.get(c.id) ?? 0,
        last_entry: lastEntry.get(c.id) ?? null,
      }));
      setCompanies(rows);
      setStatus("ok");
    })();
  }, [reloadTick]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Admin access required</h1>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex rounded-md border border-hairline bg-surface px-4 py-2 text-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground">
              <span className="text-[10px] font-bold">CC</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">Carbon Clarity · Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-elevated"
            >
              My dashboard
            </Link>
            <button
              onClick={signOut}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-elevated"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-data-muted">Administration</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">All client companies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {companies.length} {companies.length === 1 ? "company" : "companies"} on Carbon Clarity.
          </p>
        </div>

        <AddCompanyCard onAdded={() => setReloadTick((t) => t + 1)} />

        <section className="mt-8 rounded-md border border-hairline bg-surface">
          <header className="hairline-b px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Companies</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Company</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium text-right">Total kg CO₂e</th>
                  <th className="px-6 py-3 font-medium tabular">Last entry</th>
                  <th className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-xs text-muted-foreground">
                      No companies yet.
                    </td>
                  </tr>
                )}
                {companies.map((c) => (
                  <tr key={c.id} className="hairline-t transition-colors hover:bg-surface-elevated">
                    <td className="px-6 py-3">
                      <div className="font-medium text-foreground">{c.name}</div>
                      {(c.industry_type || c.location) && (
                        <div className="text-xs text-muted-foreground">
                          {c.location ?? ""}
                          {c.location && c.industry_type ? " · " : ""}
                          {c.industry_type ?? ""}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{c.contact_email ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular">
                      {c.total_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 tabular text-muted-foreground">
                      {c.last_entry ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        to="/admin/company/$id"
                        params={{ id: c.id }}
                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      >
                        View <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function AddCompanyCard({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [location, setLocation] = useState("");
  const [industryType, setIndustryType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSubmitting(true);
    const { error: insErr } = await supabase.from("companies").insert({
      name: name.trim(),
      contact_email: contactEmail.trim() || null,
      location: location.trim() || null,
      industry_type: industryType.trim() || null,
    });
    setSubmitting(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setSuccess("Company added.");
    setName("");
    setContactEmail("");
    setLocation("");
    setIndustryType("");
    onAdded();
    setTimeout(() => setSuccess(null), 2500);
  }

  return (
    <section className="rounded-md border border-hairline bg-surface">
      <header className="hairline-b px-6 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Add a new client company</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          You can link a user account to this company later via the database.
        </p>
      </header>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-4">
        <div>
          <Label>Company name *</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Contact email</Label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <Label>Location</Label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Pune, MH"
          />
        </div>
        <div>
          <Label>Industry</Label>
          <input
            value={industryType}
            onChange={(e) => setIndustryType(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Cement"
          />
        </div>
        <div className="md:col-span-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add company"}
          </button>
          {error && <span className="text-xs text-destructive">{error}</span>}
          {success && <span className="text-xs text-data-muted">{success}</span>}
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
