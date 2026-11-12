"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { RANGE_PRESETS, type RangePreset } from "@/lib/dates";
import type { ReportFilters } from "@/server/reports";
import { Field, Input, Select, cx } from "@/components/ui";

type Props = {
  filters: ReportFilters & { preset: RangePreset };
  clients: { id: number; name: string }[];
  projects: { id: number; clientId: number; name: string }[];
};

export function ReportFiltersForm({ filters, clients, projects }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<Record<"client" | "project" | "preset" | "from" | "to" | "status" | "times", string | null>>) => {
    const cur: Record<string, string | null> = {
      client: filters.clientId ? String(filters.clientId) : null,
      project: filters.projectId ? String(filters.projectId) : null,
      preset: filters.preset,
      from: filters.preset === "custom" ? filters.from : null,
      to: filters.preset === "custom" ? filters.to : null,
      status: filters.status === "all" ? null : filters.status,
      times: filters.showTimes ? "1" : "0",
      ...patch,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(cur)) if (v) q.set(k, v);
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  };

  const visibleProjects = projects.filter((p) => !filters.clientId || p.clientId === filters.clientId);

  return (
    <section aria-label="Report filters" className={cx("flex min-w-0 flex-[1_1_300px] flex-col gap-5 rounded-xl border border-stone-200 bg-white p-5", pending && "opacity-70")}>
      <Field label="Client">
        <Select value={filters.clientId ?? ""} onChange={(e) => go({ client: e.target.value || null, project: null })}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Project">
        <Select value={filters.projectId ?? ""} onChange={(e) => go({ project: e.target.value || null })}>
          <option value="">{filters.clientId ? "All projects for this client" : "All projects"}</option>
          {visibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-stone-600">Date range</legend>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((p) => {
            const on = filters.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => go(p.id === "custom" ? { preset: "custom", from: filters.from, to: filters.to } : { preset: p.id, from: null, to: null })}
                className={cx(
                  "h-9 rounded-full border px-3 text-[13px]",
                  on ? "border-accent bg-accent-soft font-semibold text-accent-hover" : "border-stone-200 font-medium text-stone-700 hover:border-stone-300",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            From
            <Input type="date" value={filters.from} onChange={(e) => e.target.value && go({ preset: "custom", from: e.target.value, to: filters.to })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            To
            <Input type="date" value={filters.to} onChange={(e) => e.target.value && go({ preset: "custom", from: filters.from, to: e.target.value })} />
          </label>
        </div>
      </fieldset>
      <Field label="Billing status">
        <Select value={filters.status} onChange={(e) => go({ status: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All entries</option>
          <option value="uninvoiced">Uninvoiced only</option>
          <option value="invoiced">Invoiced only</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2.5 border-t border-stone-100 pt-4 text-[13px] leading-snug">
        <input type="checkbox" className="mt-0.5 size-4" checked={filters.showTimes} onChange={(e) => go({ times: e.target.checked ? "1" : "0" })} />
        <span>
          <span className="font-medium">Show start &amp; end times</span>
          <span className="block text-xs text-stone-500">Adds a Worked column, e.g. 1:30p – 3:00p. Entries without times show a dash.</span>
        </span>
      </label>
    </section>
  );
}
