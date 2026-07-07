import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-sm font-semibold tracking-tight">Carbon Control</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-data-muted">
            GHG Protocol · Scope 1, 2, 3
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-foreground">
            Precise emissions data for India's manufacturing supply chain.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Carbon Control gives manufacturers audit-grade Scope 1, 2, and 3 accounting
            with versioned emission factors, locked reporting periods, and full lineage
            from every entry to its factor of record.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="inline-flex items-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
            >
              Sign in
            </Link>
          </div>
        </div>

        <dl className="mt-24 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
          {[
            { k: "Scopes covered", v: "1 · 2 · 3" },
            { k: "Factor sources", v: "CEA · IPCC · DEFRA" },
            { k: "Correction window", v: "7 days" },
          ].map((s) => (
            <div key={s.k} className="bg-surface p-6">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {s.k}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular text-foreground">{s.v}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="hairline-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Carbon Control</span>
          <span className="tabular">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <div
      aria-hidden
      className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground"
    >
      <span className="text-[10px] font-bold tracking-tight">CC</span>
    </div>
  );
}
