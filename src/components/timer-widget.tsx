"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { TimerState } from "@/server/timer";
import type { PickerClient } from "@/server/projects";
import {
  discardTimerAction,
  pauseTimerAction,
  resumeTimerAction,
  startTimerAction,
  stopTimerAction,
  updateTimerAction,
  type ActionResult,
} from "@/app/actions/data";
import { Button, Input, Select } from "./ui";

function hms(ms: number) {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/**
 * The timer's state lives on the server (start time, accumulated time, whether
 * it's running). This component only displays it, correcting for any
 * difference between the browser clock and the server clock.
 */
export function TimerWidget({ timer, serverNow, clients }: { timer: TimerState | null; serverNow: number; clients: PickerClient[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [offset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? 0);
  const [projectId, setProjectId] = useState(clients[0]?.projects[0]?.id ?? 0);
  const [desc, setDesc] = useState("");
  const [timerDesc, setTimerDesc] = useState(timer?.description ?? "");

  useEffect(() => setTimerDesc(timer?.description ?? ""), [timer?.description]);
  useEffect(() => {
    if (!timer?.runningSince) return;
    const iv = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(iv);
  }, [timer?.runningSince, offset]);

  const projects = useMemo(() => clients.find((c) => c.id === clientId)?.projects ?? [], [clients, clientId]);

  const act = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError("");
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });

  if (!timer) {
    if (!open) {
      return (
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)} disabled={clients.length === 0} title={clients.length ? undefined : "Add a client and project first"}>
          <Play size={14} aria-hidden /> Start timer
        </Button>
      );
    }
    return (
      <form
        aria-label="Start timer"
        className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => startTimerAction({ projectId, description: desc }), () => {
            setOpen(false);
            setDesc("");
          });
        }}
      >
        <Select
          aria-label="Client"
          value={clientId}
          onChange={(e) => {
            const c = clients.find((x) => x.id === Number(e.target.value));
            setClientId(Number(e.target.value));
            setProjectId(c?.projects[0]?.id ?? 0);
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Project" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input aria-label="What are you working on?" placeholder="What are you working on?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={pending || !projectId}>
            Start
          </Button>
        </div>
      </form>
    );
  }

  const running = !!timer.runningSince;
  const elapsed = timer.accumulatedMs + (timer.runningSince ? Math.max(0, now - timer.runningSince) : 0);
  return (
    <section aria-label="Running timer" className="flex flex-col gap-2.5 rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={running ? "size-2 rounded-full bg-accent" : "size-2 rounded-full bg-stone-400"} aria-hidden />
        <span className={running ? "text-accent" : "text-stone-500"}>{running ? "Running" : "Paused"}</span>
      </div>
      <div className="text-[26px] font-semibold tracking-tight" aria-live="off">
        {hms(elapsed)}
      </div>
      <div className="text-xs leading-snug text-stone-600">
        {timer.clientName} · {timer.projectName}
      </div>
      <Input
        aria-label="Timer description"
        placeholder="What are you working on?"
        className="h-9 text-[13px]"
        value={timerDesc}
        onChange={(e) => setTimerDesc(e.target.value)}
        onBlur={() => timerDesc !== timer.description && act(() => updateTimerAction({ description: timerDesc }))}
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <Button className="flex-1 h-11" disabled={pending} onClick={() => act(running ? pauseTimerAction : resumeTimerAction)}>
          {running ? "Pause" : "Resume"}
        </Button>
        <Button variant="dark" className="flex-1 h-11" disabled={pending} onClick={() => act(() => stopTimerAction({ description: timerDesc }))}>
          Stop &amp; save
        </Button>
      </div>
      <button
        type="button"
        className="self-start text-xs text-stone-500 hover:text-red-700"
        disabled={pending}
        onClick={() => {
          if (confirm("Discard this timer? The tracked time will not be saved.")) act(discardTimerAction);
        }}
      >
        Discard timer
      </button>
    </section>
  );
}
