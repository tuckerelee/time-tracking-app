"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PickerClient } from "@/server/projects";
import { saveEntry } from "@/app/actions/data";
import { billableCents, formatCents, parseMoneyToCents } from "@/lib/money";
import { formatDuration, formatTimeSpan, minutesBetween, parseDuration, parseTimeOfDay, toHHMM, type TimeFormat } from "@/lib/duration";
import { Button, Field, Input, Select, cx } from "./ui";

export type EditableEntry = {
  id: number;
  date: string;
  clientId: number;
  clientName: string;
  projectId: number;
  projectName: string;
  description: string;
  minutes: number;
  rateCents: number;
  startTime: string | null;
  endTime: string | null;
};

type Props = {
  clients: PickerClient[];
  today: string;
  timeFormat: TimeFormat;
  /** Edit mode when given. */
  entry?: EditableEntry;
  defaultClientId?: number | null;
  defaultProjectId?: number | null;
  onDone?: () => void;
  compact?: boolean;
};

const centsToInput = (c: number) => (c / 100).toFixed(2);

export function EntryForm({ clients: baseClients, today, timeFormat, entry, defaultClientId, defaultProjectId, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Keep an archived project selectable when editing one of its entries.
  const clients = useMemo(() => {
    if (!entry) return baseClients;
    if (baseClients.some((c) => c.projects.some((p) => p.id === entry.projectId))) return baseClients;
    const extra = { id: entry.projectId, name: `${entry.projectName} (archived)`, rateCents: entry.rateCents, rateSource: "project" as const };
    const existing = baseClients.find((c) => c.id === entry.clientId);
    if (existing) return baseClients.map((c) => (c.id === entry.clientId ? { ...c, projects: [...c.projects, extra] } : c));
    return [...baseClients, { id: entry.clientId, name: entry.clientName, rateCents: entry.rateCents, projects: [extra] }];
  }, [baseClients, entry]);

  const initial = (() => {
    if (entry) return { clientId: entry.clientId, projectId: entry.projectId };
    const byProject = defaultProjectId ? clients.find((c) => c.projects.some((p) => p.id === defaultProjectId)) : undefined;
    if (byProject) return { clientId: byProject.id, projectId: defaultProjectId! };
    const byClient = defaultClientId ? clients.find((c) => c.id === defaultClientId) : undefined;
    const c = byClient ?? clients[0];
    return { clientId: c?.id ?? 0, projectId: c?.projects[0]?.id ?? 0 };
  })();

  const [clientId, setClientId] = useState(initial.clientId);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [date, setDate] = useState(entry?.date ?? today);
  const [desc, setDesc] = useState(entry?.description ?? "");
  const [dur, setDur] = useState(entry ? formatDuration(entry.minutes) : "");
  const [start, setStart] = useState(entry?.startTime ?? "");
  const [end, setEnd] = useState(entry?.endTime ?? "");
  const projectsFor = (cid: number) => clients.find((c) => c.id === cid)?.projects ?? [];
  const projectRate = (pid: number) => clients.flatMap((c) => c.projects).find((p) => p.id === pid);
  const [rate, setRate] = useState(() => centsToInput(entry?.rateCents ?? projectRate(initial.projectId)?.rateCents ?? 0));
  const [keep, setKeep] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const project = projectRate(projectId);
  const minutes = parseDuration(dur);
  const rateCents = parseMoneyToCents(rate);
  const effective = project?.rateCents ?? 0;
  const rateLabel =
    entry && rateCents === entry.rateCents && projectId === entry.projectId
      ? "saved rate"
      : rateCents !== effective
        ? "custom for this entry"
        : project?.rateSource === "project"
          ? "project rate"
          : "client rate";
  const span = start && end ? formatTimeSpan(start, end, timeFormat) : "";

  // Start + end → duration; start + duration → end.
  function sync(next: { start?: string; end?: string; dur?: string }, field: "start" | "end" | "dur") {
    const s = next.start ?? start;
    const e = next.end ?? end;
    const d = next.dur ?? dur;
    const sm = parseTimeOfDay(s);
    const em = parseTimeOfDay(e);
    const dm = parseDuration(d);
    let newDur = d;
    let newEnd = e;
    if (field !== "dur" && sm !== null && em !== null) newDur = formatDuration(minutesBetween(sm, em));
    else if (field !== "end" && sm !== null && dm) newEnd = toHHMM(sm + dm);
    setStart(s);
    setEnd(newEnd);
    setDur(newDur);
  }

  function selectProject(pid: number) {
    setProjectId(pid);
    if (entry && pid === entry.projectId) setRate(centsToInput(entry.rateCents));
    else setRate(centsToInput(projectRate(pid)?.rateCents ?? 0));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!projectId) return setMsg({ ok: false, text: "Choose a client and project." });
    if (!desc.trim()) return setMsg({ ok: false, text: "Describe the work performed." });
    if (!minutes) return setMsg({ ok: false, text: "Enter a duration like 1:30, 1h 30m, 90m or 1.5." });
    if (rateCents === null) return setMsg({ ok: false, text: "Enter an hourly rate like 85 or 85.50." });
    startTransition(async () => {
      const r = await saveEntry({ id: entry?.id, date, projectId, description: desc, minutes, rate, startTime: start || null, endTime: end || null });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.refresh();
      if (entry) return onDone?.();
      const c = clients.find((x) => x.id === clientId);
      setMsg({ ok: true, text: `Saved · ${formatDuration(minutes)} · ${formatCents(billableCents(minutes, rateCents))} to ${c?.name} / ${project?.name}` });
      setDesc("");
      setDur("");
      setStart(keep && end ? end : "");
      setEnd("");
      if (!keep) {
        const first = clients[0];
        setClientId(first?.id ?? 0);
        setProjectId(first?.projects[0]?.id ?? 0);
        setRate(centsToInput(first?.projects[0]?.rateCents ?? 0));
      }
      onDone?.();
    });
  }

  if (clients.length === 0) {
    return <p className="text-sm text-stone-600">Add a client and a project first, then you can log time.</p>;
  }

  return (
    <form onSubmit={submit} aria-label={entry ? "Edit time entry" : "Add time entry"} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Client" className="col-span-2 sm:col-span-1 lg:col-span-1">
          <Select
            value={clientId}
            onChange={(e) => {
              const cid = Number(e.target.value);
              setClientId(cid);
              selectProject(projectsFor(cid)[0]?.id ?? 0);
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Project" className="col-span-2 sm:col-span-1 lg:col-span-1">
          <Select value={projectId} onChange={(e) => selectProject(Number(e.target.value))}>
            {projectsFor(clientId).length === 0 ? <option value={0}>No active projects</option> : null}
            {projectsFor(clientId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" className="col-span-2 sm:col-span-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start">
          <Input type="time" value={start} onChange={(e) => sync({ start: e.target.value }, "start")} />
        </Field>
        <Field label="End">
          <Input type="time" value={end} onChange={(e) => sync({ end: e.target.value }, "end")} />
        </Field>
        <Field label="Duration" className="col-span-2 sm:col-span-1">
          <Input
            value={dur}
            onChange={(e) => sync({ dur: e.target.value }, "dur")}
            placeholder="1:30, 1h 30m, 90m, 1.5"
            className="font-semibold"
            inputMode="text"
            autoComplete="off"
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-stone-500">
        Start and end times are optional. Enter both to fill in the duration, or a start and a duration to fill in the end.
      </p>
      <Field label="Work performed">
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What did you work on?" maxLength={2000} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-4">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-stone-500">Parsed</span>
            <span className={cx("text-sm font-semibold", dur && !minutes && "text-red-700")}>
              {minutes ? `${formatDuration(minutes)} (${minutes} min)` : dur ? "Not recognized" : "—"}
              {minutes && span ? <span className="font-normal text-stone-500"> · {span}</span> : null}
            </span>
          </div>
          <label className="flex flex-col gap-0.5 text-xs text-stone-500">
            <span>Hourly rate · {rateLabel}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-stone-900">
              $
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                aria-label="Hourly rate for this entry"
                className="h-8 w-20 rounded-md border border-stone-200 px-1.5 font-semibold"
              />
              /hr
            </span>
          </label>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-stone-500">Billable total</span>
            <span className="text-[22px] font-bold tracking-tight text-accent">
              {minutes && rateCents !== null ? formatCents(billableCents(minutes, rateCents)) : "$0.00"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!entry ? (
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-stone-600">
              <input type="checkbox" className="size-4" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Add another (keep client &amp; project)
            </label>
          ) : (
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? "Saving…" : entry ? "Save changes" : "Save entry"}
          </Button>
        </div>
      </div>
      {msg ? (
        <p role="status" className={cx("text-[13px]", msg.ok ? "text-accent" : "text-red-700")}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
