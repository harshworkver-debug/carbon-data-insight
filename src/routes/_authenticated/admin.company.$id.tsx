import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ShieldAlert, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CompanyData } from "@/components/company-data";

export const Route = createFileRoute("/_authenticated/admin/company/$id")({
  head: () => ({
    meta: [
      { title: "Client detail — Carbon Clarity" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuditorView,
});

function AuditorView() {
  const { id } = Route.useParams();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "denied" }
    | { status: "ok"; name: string; location: string | null; industry_type: string | null }
    | { status: "missing" }
  >({ status: "loading" });

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return setState({ status: "denied" });
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r) => r.role === "admin")) {
        return setState({ status: "denied" });
      }
      const { data: company } = await supabase
        .from("companies")
        .select("name, location, industry_type")
        .eq("id", id)
        .maybeSingle();
      if (!company) return setState({ status: "missing" });
      setState({ status: "ok", ...company });
    })();
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state.status === "denied") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Admin access required</h1>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-4 py-2 text-sm"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Company not found.</h1>
          <Link to="/admin" className="mt-4 inline-flex text-sm text-primary">
            Back to admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold tracking-tight">Client detail</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-amber-300">
            <Eye className="h-3 w-3" />
            Viewing {state.name}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-data-muted">Client company</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{state.name}</h1>
          {(state.location || state.industry_type) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {state.location ?? ""}
              {state.location && state.industry_type ? " · " : ""}
              {state.industry_type ?? ""}
            </p>
          )}
        </div>
        <CompanyData companyId={id} readOnly />
      </main>
    </div>
  );
}
