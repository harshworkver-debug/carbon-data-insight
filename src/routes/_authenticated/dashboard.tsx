import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Profile = {
  full_name: string | null;
  company_id: string | null;
  companies: { name: string; location: string | null; industry_type: string | null } | null;
};

function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setEmail(userData.user?.email ?? null);
      if (!userData.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, company_id, companies(name, location, industry_type)")
        .eq("id", userData.user.id)
        .maybeSingle();
      setProfile(data as unknown as Profile);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  const company = profile?.companies;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground">
              <span className="text-[10px] font-bold">CC</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">Carbon Control</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted-foreground sm:inline tabular">{email}</span>
            <button
              onClick={signOut}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-elevated"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-xs uppercase tracking-[0.2em] text-data-muted">Workspace</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {company?.name ?? "Your company"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {company?.location ? `${company.location} · ` : ""}
          {company?.industry_type ?? "Emissions ledger ready."}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-surface p-6">
          <div>
            <div className="text-sm font-medium text-foreground">Record activity</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Log fuel, electricity, freight, or travel. Emissions calculate on save.
            </p>
          </div>
          <Link
            to="/dashboard/entry"
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New entry
          </Link>
        </div>

      </main>
    </div>
  );
}
