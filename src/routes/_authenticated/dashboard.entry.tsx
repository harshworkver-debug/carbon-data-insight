import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, ChevronLeft, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
};

export const Route = createFileRoute("/_authenticated/dashboard/entry")({
  component: EntryPage,
});

const SCOPE_META: Record<
  Scope,
  { label: string; short: string; description: string }
> = {
  scope_1: {
    label: "Scope 1: Direct Emissions",
    short: "Scope 1",
    description:
      "Fuels combusted on-site and refrigerant gases topped up in owned equipment.",
  },
  scope_2: {
    label: "Scope 2: Indirect Emissions (Electricity)",
    short: "Scope 2",
    description: "Grid electricity purchased from the utility.",
  },
  scope_3: {
    label: "Scope 3: Supply Chain & Travel",
    short: "Scope 3",
    description:
      "Upstream freight and business travel — priced with international proxy factors until India-specific factors are verified.",
  },
};

const SUBTYPE_HINTS: Record<string, string> = {
  "Grid Electricity (Indian Grid - Weighted Average)":
    "Check the 'units consumed' line on your monthly utility bill. Enter in kWh — we'll convert to MWh automatically.",
  "Refrigerant R-134a (per kg leaked)":
    "Apply only to the quantity of gas actually topped-up during servicing, not the total charge capacity of the AC system.",
  "Refrigerant R-22 (per kg leaked)":
    "Apply only to the quantity of gas actually topped-up during servicing, not the total charge capacity of the AC system.",
  "Refrigerant R-410A (per kg leaked)":
    "Apply only to the quantity of gas actually topped-up during servicing, not the total charge capacity of the AC system.",
  "High-Speed Diesel (HSD) - Stationary":
    "For diesel gensets: use the fuel-log volume actually consumed during the period, not tank capacity.",
  "High-Speed Diesel (HSD) - Mobile/Transport":
    "For owned trucks / forklifts: total diesel dispensed into the vehicle during the period.",
  "Business Travel - Air (long-haul)":
    "Passenger-km = one-way distance × number of employees on that leg. Round trips count both legs.",
  "Business Travel - Air (short-haul)":
    "Flights under ~3,700 km. Passenger-km = distance × number of employees.",
};

const ELECTRICITY_SUBTYPE = "Grid Electricity (Indian Grid - Weighted Average)";

function reportingPeriodFor(dateStr: string): string {
  // YYYY-MM
  return dateStr.slice(0, 7);
}

function EntryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<Scope>("scope_1");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", data.user.id)
        .maybeSingle();
      setCompanyId(profile?.company_id ?? null);
    })();
  }, []);

  const factorsQuery = useQuery({
    queryKey: ["emission_factors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emission_factors")
        .select("id, scope, category, sub_type, unit, co2e_factor, is_proxy_data, source")
        .order("scope")
        .order("category")
        .order("sub_type");
      if (error) throw error;
      return (data ?? []) as Factor[];
    },
  });

  const factors = factorsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="hairline-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-semibold tracking-tight">New entry</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs uppercase tracking-[0.2em] text-data-muted">Ledger</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Record an activity</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Enter the fuel, electricity, travel, or freight activity as it was measured on
          the source document. Emissions are calculated automatically the moment you save.
        </p>

        {!companyId ? (
          <div className="mt-8 rounded-md border border-hairline bg-surface p-6 text-sm text-muted-foreground">
            {companyId === null && userId
              ? "Your profile is not linked to a company yet. Finish onboarding on the dashboard first."
              : "Loading your workspace…"}
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
            <Tabs
              value={activeScope}
              onValueChange={(v) => setActiveScope(v as Scope)}
              className="mt-8"
            >
              <TabsList className="grid w-full grid-cols-3 bg-surface">
                <TabsTrigger value="scope_1">Scope 1</TabsTrigger>
                <TabsTrigger value="scope_2">Scope 2</TabsTrigger>
                <TabsTrigger value="scope_3">Scope 3</TabsTrigger>
              </TabsList>

              {(["scope_1", "scope_2", "scope_3"] as const).map((scope) => (
                <TabsContent key={scope} value={scope} className="mt-6">
                  <ScopePanel
                    scope={scope}
                    companyId={companyId}
                    userId={userId!}
                    factors={factors.filter((f) => f.scope === scope)}
                    loading={factorsQuery.isLoading}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["ghg_entries"] });
                      navigate({ to: "/dashboard" });
                    }}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </TooltipProvider>
        )}
      </main>
    </div>
  );
}


function ScopePanel({
  scope,
  companyId,
  userId,
  factors,
  loading,
  onSaved,
}: {
  scope: Scope;
  companyId: string;
  userId: string;
  factors: Factor[];
  loading: boolean;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [subType, setSubType] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [quantityError, setQuantityError] = useState<string | null>(null);

  // Reset dependent fields when scope changes
  useEffect(() => {
    setCategory("");
    setSubType("");
    setUnit("");
    setQuantity("");
    setQuantityError(null);
  }, [scope]);

  const categories = useMemo(
    () => Array.from(new Set(factors.map((f) => f.category))),
    [factors],
  );

  const subTypes = useMemo(
    () => factors.filter((f) => f.category === category),
    [factors, category],
  );

  const selectedFactor = useMemo(
    () => factors.find((f) => f.sub_type === subType) ?? null,
    [factors, subType],
  );

  // Auto-lock the unit to the factor's unit whenever sub_type changes.
  // Grid Electricity is the sole exception: the user may enter kWh (bill units)
  // and the calculation engine converts to MWh.
  useEffect(() => {
    if (!selectedFactor) {
      setUnit("");
      return;
    }
    if (selectedFactor.sub_type === ELECTRICITY_SUBTYPE) {
      setUnit("kWh"); // default to what the utility bill shows
    } else {
      setUnit(selectedFactor.unit);
    }
  }, [selectedFactor]);

  const isElectricity = selectedFactor?.sub_type === ELECTRICITY_SUBTYPE;
  const hint = subType ? SUBTYPE_HINTS[subType] : null;

  function validateQuantity(v: string): string | null {
    if (v.trim() === "") return "Quantity is required.";
    const n = Number(v);
    if (!Number.isFinite(n)) return "Enter a valid number.";
    if (n <= 0) return "Quantity must be greater than zero.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFactor) {
      toast.error("Choose a category and sub-type first.");
      return;
    }
    const qErr = validateQuantity(quantity);
    if (qErr) {
      setQuantityError(qErr);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("ghg_entries").insert({
      company_id: companyId,
      entered_by: userId,
      scope,
      category: selectedFactor.category,
      sub_type: selectedFactor.sub_type,
      quantity: Number(quantity),
      unit,
      entry_date: entryDate,
      reporting_period: reportingPeriodFor(entryDate),
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry recorded — emissions calculated.");
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-hairline bg-surface p-6">
      <div className="mb-6">
        <div className="text-sm font-medium text-foreground">
          {SCOPE_META[scope].label}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{SCOPE_META[scope].description}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Category" htmlFor={`${scope}-category`}>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setSubType("");
            }}
            disabled={loading || categories.length === 0}
          >
            <SelectTrigger id={`${scope}-category`}>
              <SelectValue placeholder={loading ? "Loading…" : "Select category"} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={
            <span className="flex items-center gap-2">
              Sub-type
              {selectedFactor?.is_proxy_data && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium uppercase tracking-wider text-amber-300"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  International proxy benchmark
                </Badge>
              )}
            </span>
          }
          htmlFor={`${scope}-subtype`}
        >
          <Select
            value={subType}
            onValueChange={setSubType}
            disabled={!category}
          >
            <SelectTrigger id={`${scope}-subtype`}>
              <SelectValue placeholder={category ? "Select sub-type" : "Choose category first"} />
            </SelectTrigger>
            <SelectContent>
              {subTypes.map((f) => (
                <SelectItem key={f.id} value={f.sub_type ?? ""}>
                  {f.sub_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={
            <span className="flex items-center gap-1.5">
              Quantity
              {hint && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {hint}
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          }
          htmlFor={`${scope}-qty`}
        >
          <Input
            id={`${scope}-qty`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setQuantityError(validateQuantity(e.target.value));
            }}
            placeholder="0.00"
            className="tabular"
            aria-invalid={!!quantityError}
          />
          {quantityError && (
            <div className="mt-1 text-xs text-destructive">{quantityError}</div>
          )}
        </Field>

        <Field label="Unit" htmlFor={`${scope}-unit`}>
          {isElectricity ? (
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id={`${scope}-unit`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kWh">kWh (utility bill)</SelectItem>
                <SelectItem value="MWh">MWh</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${scope}-unit`}
              value={unit}
              readOnly
              disabled
              placeholder="Auto-set from sub-type"
              className="tabular text-muted-foreground"
            />
          )}
          {selectedFactor && !isElectricity && (
            <div className="mt-1 text-[11px] text-data-muted">
              Locked to match the emission factor.
            </div>
          )}
        </Field>

        <Field label="Activity date" htmlFor={`${scope}-date`}>
          <Input
            id={`${scope}-date`}
            type="date"
            value={entryDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </Field>

        <Field label="Reporting period" htmlFor={`${scope}-period`}>
          <Input
            id={`${scope}-period`}
            value={reportingPeriodFor(entryDate)}
            readOnly
            disabled
            className="tabular text-muted-foreground"
          />
        </Field>

        <div className="md:col-span-2">
          <Field label="Notes (optional)" htmlFor={`${scope}-notes`}>
            <Textarea
              id={`${scope}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Meter reading reference, invoice number, or context for the auditor."
              rows={3}
              maxLength={1000}
            />
          </Field>
        </div>
      </div>

      {selectedFactor && (
        <div className="mt-6 rounded-md border border-hairline bg-background/40 p-4 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-4">
            <div>
              Factor:{" "}
              <span className="tabular text-foreground">
                {selectedFactor.co2e_factor}
              </span>{" "}
              kg CO₂e / {selectedFactor.unit}
            </div>
            {selectedFactor.source && (
              <div className="text-right text-[11px] text-data-muted">
                {selectedFactor.source}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-hairline pt-5">
        <p className="max-w-md text-[11px] text-muted-foreground">
          Entries lock 7 days after creation. After that, submit a linked correction
          entry to preserve the audit trail.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => history.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !selectedFactor}>
            {submitting ? "Saving…" : "Record entry"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-data-muted"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
