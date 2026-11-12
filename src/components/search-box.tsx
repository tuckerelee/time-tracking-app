"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "./ui";

/** Search + "show archived" controls that live in the URL. */
export function ListControls({ placeholder, children }: { placeholder: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("new");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        fit className="h-9 w-64 max-w-full text-[13px]"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => set("q", e.target.value || null)}
      />
      {children}
      <label className="flex items-center gap-2 text-[13px] text-stone-600">
        <input type="checkbox" className="size-4" checked={params.get("archived") === "1"} onChange={(e) => set("archived", e.target.checked ? "1" : null)} />
        Show archived
      </label>
    </div>
  );
}

export function ClientFilter({ clients }: { clients: { id: number; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Filter by client"
      className="h-9 rounded-lg border border-stone-300 bg-white px-3 pr-8 text-[13px]"
      value={params.get("client") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("client", e.target.value);
        else next.delete("client");
        next.delete("new");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      <option value="">All clients</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
