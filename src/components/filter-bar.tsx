"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { PickerClient } from "@/server/projects";
import { Input, Select, cx } from "./ui";

/** URL-driven filters for the entries page. */
export function EntryFilterBar({ clients }: { clients: { id: number; name: string; projects: PickerClient["projects"] }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const status = params.get("status") ?? "all";
  const clientId = params.get("client") ?? "";
  const projectId = params.get("project") ?? "";
  const projects = clients.find((c) => String(c.id) === clientId)?.projects ?? [];

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div role="group" aria-label="Billing status" className="inline-flex gap-0.5 rounded-xl bg-stone-100 p-1">
        {[
          ["all", "All"],
          ["uninvoiced", "Uninvoiced"],
          ["invoiced", "Invoiced"],
        ].map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={status === v}
            onClick={() => set({ status: v === "all" ? null : v })}
            className={cx(
              "h-9 rounded-lg px-3.5 text-[13px]",
              status === v ? "bg-white font-semibold text-stone-900 shadow-sm" : "font-medium text-stone-600 hover:text-stone-900",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Client" fit className="h-9 text-[13px]" value={clientId} onChange={(e) => set({ client: e.target.value || null, project: null })}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {clientId ? (
          <Select aria-label="Project" fit className="h-9 text-[13px]" value={projectId} onChange={(e) => set({ project: e.target.value || null })}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-stone-500">
          From
          <Input type="date" fit className="h-9 text-[13px]" value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-500">
          To
          <Input type="date" fit className="h-9 text-[13px]" value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} />
        </label>
        <Input
          type="search"
          aria-label="Search entries"
          placeholder="Search…"
          fit className="h-9 w-40 text-[13px]"
          defaultValue={params.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value || null });
          }}
          onBlur={(e) => set({ q: e.target.value || null })}
        />
        {params.toString() ? (
          <button type="button" className="h-9 px-2 text-[13px] text-stone-500 hover:text-stone-900" onClick={() => router.replace(pathname)}>
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
