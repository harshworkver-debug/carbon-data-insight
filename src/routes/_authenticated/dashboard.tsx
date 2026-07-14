import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CompanyDashboard } from "@/components/company-dashboard";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Carbon Control" },
      {
        name: "description",
        content:
          "Analytical dashboard for Scope 1, 2, and 3 emissions across your facilities, regions, and reporting periods.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setEmail(userData.user?.email ?? null);
      if (!userData.user) return;
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, company_id, companies(name, location, industry_type)")
          .eq("id", userData.user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
      ]);
      setProfile(p as unknown as Profile);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
      setLoaded(true);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  const company = profile?.companies;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground">
              <span className="text-[10px] font-bold">CC</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">Carbon Control</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-elevated"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Admin
              </Link>
            )}
            <Link
              to="/dashboard/entry"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              New entry
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:inline tabular">{email}</span>
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
        <div className="no-print mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-data-muted">Workspace</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {company?.name ?? (loaded ? "Your company" : "Loading…")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company?.location ? `${company.location}` : ""}
            {company?.location && company?.industry_type ? " · " : ""}
            {company?.industry_type ?? ""}
          </p>
        </div>

        {loaded && profile?.company_id && company ? (
          <CompanyDashboard companyId={profile.company_id} companyName={company.name} />
        ) : (
          loaded && (
            <div className="rounded-md border border-hairline bg-surface p-6 text-sm text-muted-foreground">
              Your profile is not linked to a company yet.
            </div>
          )
        )}
      </main>
    </div>
  );
}
