"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Pencil, Trash2 } from "lucide-react";
import type { EntryRow } from "@/server/entries";
import type { PickerClient } from "@/server/projects";
import { deleteEntriesAction, duplicateEntryAction, setBillingStatusAction, type ActionResult } from "@/app/actions/data";
import { formatCents } from "@/lib/money";
import { formatDuration, formatTimeSpan, type TimeFormat } from "@/lib/duration";
import { formatDayHeading } from "@/lib/dates";
import { Button, EmptyState, StatusBadge, cx } from "./ui";
import { Modal } from "./modal";
import { EntryForm } from "./entry-form";

type Props = {
  entries: EntryRow[];
  clients: PickerClient[];
  today: string;
  timeFormat: TimeFormat;
  /** Hide the client/project line (e.g. on a project page). */
  hideProject?: boolean;
  selectable?: boolean;
  emptyText?: string;
};

export function EntriesList({ entries, clients, today, timeFormat, hideProject, selectable = true, emptyText = "No entries match these filters." }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [ref, setRef] = useState("");
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const groups = useMemo(() => {
    const out: { date: string; minutes: number; cents: number; items: EntryRow[] }[] = [];
    for (const e of entries) {
      let g = out[out.length - 1];
      if (!g || g.date !== e.date) out.push((g = { date: e.date, minutes: 0, cents: 0, items: [] }));
      g.items.push(e);
      g.minutes += e.minutes;
      g.cents += e.amountCents;
    }
    return out;
  }, [entries]);

  const visibleIds = entries.map((e) => e.id);
  const selIds = visibleIds.filter((id) => selected.has(id));
  const selCents = entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amountCents, 0);
  const allChecked = visibleIds.length > 0 && selIds.length === visibleIds.length;

  const act = (fn: () => Promise<ActionResult>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return setFlash({ ok: false, text: r.error });
      setFlash({ ok: true, text: ok });
      after?.();
      router.refresh();
    });

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cols = selectable ? "grid-cols-[40px_minmax(0,1fr)_116px_84px_92px_112px_108px]" : "grid-cols-[minmax(0,1fr)_116px_84px_92px_112px_108px]";

  return (
    <div className="flex flex-col gap-3">
      {selectable && selIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-white">
          <span className="text-sm font-semibold">
            {selIds.length} selected · {formatCents(selCents)}
          </span>
          <span className="flex-1" />
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Invoice # or note (optional)"
            aria-label="Invoice reference"
            maxLength={100}
            className="h-10 min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 text-[13px] text-white placeholder:text-stone-400 sm:max-w-60"
          />
          <Button
            size="sm"
            className="h-10"
            disabled={pending}
            onClick={() =>
              act(() => setBillingStatusAction(selIds, "invoiced", ref), `${selIds.length} ${selIds.length === 1 ? "entry" : "entries"} marked as invoiced`, () => {
                setSelected(new Set());
                setRef("");
              })
            }
          >
            Mark as invoiced
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 text-stone-200 hover:bg-stone-800 hover:text-white"
            disabled={pending}
            onClick={() => act(() => setBillingStatusAction(selIds, "uninvoiced"), "Marked as uninvoiced", () => setSelected(new Set()))}
          >
            Mark uninvoiced
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 text-stone-200 hover:bg-stone-800 hover:text-white"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete ${selIds.length} ${selIds.length === 1 ? "entry" : "entries"}? This can't be undone.`))
                act(() => deleteEntriesAction(selIds), "Deleted", () => setSelected(new Set()));
            }}
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="h-10 text-stone-300 hover:bg-stone-800 hover:text-white" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {flash ? (
        <p role="status" className={cx("text-[13px]", flash.ok ? "text-accent" : "text-red-700")}>
          {flash.text}
        </p>
      ) : null}

      <section aria-label="Entries" className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <div className={selectable ? "min-w-[920px]" : "min-w-[860px]"}>
          <div className={cx("grid items-center border-b border-stone-100 px-3 py-2.5 text-xs font-medium text-stone-500", cols)}>
            {selectable ? (
              <input
                type="checkbox"
                className="mx-auto size-4"
                aria-label="Select all shown entries"
                checked={allChecked}
                onChange={() => setSelected(allChecked ? new Set() : new Set(visibleIds))}
              />
            ) : null}
            <span className={selectable ? "" : "pl-2"}>Work</span>
            <span className="text-right">Time</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
            <span className="pl-4">Status</span>
            <span />
          </div>
          {groups.length === 0 ? <EmptyState title={emptyText} /> : null}
          {groups.map((g) => (
            <div key={g.date}>
              <div className={cx("flex justify-between border-b border-stone-100 bg-stone-50 py-2 pr-5 text-xs font-semibold text-stone-600", selectable ? "pl-14" : "pl-5")}>
                <span>{formatDayHeading(g.date)}</span>
                <span>
                  {formatDuration(g.minutes)} · {formatCents(g.cents)}
                </span>
              </div>
              {g.items.map((e) => {
                const span = formatTimeSpan(e.startTime, e.endTime, timeFormat);
                return (
                  <div key={e.id} className={cx("grid items-center border-b border-stone-100 px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-stone-50", cols)}>
                    {selectable ? (
                      <input type="checkbox" className="mx-auto size-4" aria-label={`Select entry: ${e.description}`} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                    ) : null}
                    <div className={cx("min-w-0 pr-3", !selectable && "pl-2")}>
                      <div className="truncate font-medium" title={e.description}>
                        {e.description}
                      </div>
                      {!hideProject ? (
                        <div className="mt-0.5 truncate text-stone-500">
                          <Link href={`/clients/${e.clientId}`} className="hover:text-stone-900">
                            {e.clientName}
                          </Link>
                          {" · "}
                          <Link href={`/projects/${e.projectId}`} className="hover:text-stone-900">
                            {e.projectName}
                          </Link>
                          {e.source === "timer" ? " · timer" : ""}
                        </div>
                      ) : null}
                    </div>
                    <span className="flex flex-col items-end">
                      <span>{formatDuration(e.minutes)}</span>
                      <span className="text-xs whitespace-nowrap text-stone-500">{span || "No times"}</span>
                    </span>
                    <span className="text-right text-stone-600">{formatCents(e.rateCents)}</span>
                    <span className="text-right font-semibold">{formatCents(e.amountCents)}</span>
                    <span className="pl-4">
                      <StatusBadge status={e.status} invoiceRef={e.invoiceRef} />
                    </span>
                    <span className="flex justify-end gap-0.5">
                      <IconButton label="Edit entry" onClick={() => setEditing(e)}>
                        <Pencil size={15} aria-hidden />
                      </IconButton>
                      <IconButton label="Duplicate entry to today" disabled={pending} onClick={() => act(() => duplicateEntryAction(e.id), "Duplicated to today")}>
                        <Copy size={15} aria-hidden />
                      </IconButton>
                      <IconButton
                        label="Delete entry"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Delete this entry?\n\n${e.description} · ${formatDuration(e.minutes)} · ${formatCents(e.amountCents)}`))
                            act(() => deleteEntriesAction([e.id]), "Entry deleted");
                        }}
                      >
                        <Trash2 size={15} aria-hidden />
                      </IconButton>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit time entry" wide>
        {editing ? (
          <EntryForm
            key={editing.id}
            clients={clients}
            today={today}
            timeFormat={timeFormat}
            entry={editing}
            onDone={() => {
              setEditing(null);
              setFlash({ ok: true, text: "Entry updated" });
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function IconButton({ label, children, ...props }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}
