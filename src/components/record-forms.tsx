"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteClientAction,
  deleteProjectAction,
  saveClient,
  saveProject,
  setClientArchivedAction,
  setProjectArchivedAction,
  type ActionResult,
} from "@/app/actions/data";
import { formatCents } from "@/lib/money";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";
import { Modal } from "./modal";

const toInput = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

function ErrorText({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="text-[13px] text-red-700">
      {text}
    </p>
  ) : null;
}

type ClientValues = { id?: number; name: string; company: string | null; email: string | null; phone: string | null; notes: string | null; rateCents: number };

export function ClientForm({ client, defaultRateCents, onDone }: { client?: ClientValues; defaultRateCents: number; onDone: (id?: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [v, setV] = useState({
    name: client?.name ?? "",
    company: client?.company ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    notes: client?.notes ?? "",
    rate: toInput(client?.rateCents ?? defaultRateCents),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const rateChanged = client && toInput(client.rateCents) !== v.rate;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = (await saveClient({ id: client?.id, ...v })) as ActionResult<{ id: number }>;
          if (!r.ok) return setError(r.error);
          router.refresh();
          onDone(r.data?.id);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client name">
          <Input value={v.name} onChange={set("name")} required maxLength={200} autoFocus />
        </Field>
        <Field label="Company name (if different)">
          <Input value={v.company} onChange={set("company")} maxLength={200} />
        </Field>
        <Field label="Email">
          <Input type="email" value={v.email} onChange={set("email")} maxLength={200} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={v.phone} onChange={set("phone")} maxLength={50} />
        </Field>
        <Field label="Default hourly rate" hint={client ? "Applies to new entries only. Saved entries keep the rate they were logged at." : `Starts at your default rate, ${formatCents(defaultRateCents)}/hr.`}>
          <span className="flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold focus-within:outline-2 focus-within:outline-accent">
            $<input value={v.rate} onChange={set("rate")} inputMode="decimal" aria-label="Hourly rate in dollars" className="min-w-0 flex-1 outline-none" required />
            /hr
          </span>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea rows={3} value={v.notes} onChange={set("notes")} maxLength={5000} />
      </Field>
      {rateChanged ? <p className="text-[13px] text-stone-600">Existing entries will keep their saved rates.</p> : null}
      <ErrorText text={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : client ? "Save client" : "Add client"}
        </Button>
      </div>
    </form>
  );
}

type ProjectValues = { id?: number; clientId: number; name: string; description: string | null; rateCents: number | null };

export function ProjectForm({
  project,
  clients,
  defaultClientId,
  onDone,
}: {
  project?: ProjectValues;
  clients: { id: number; name: string; rateCents: number }[];
  defaultClientId?: number | null;
  onDone: (id?: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState(project?.clientId ?? defaultClientId ?? clients[0]?.id ?? 0);
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [rate, setRate] = useState(toInput(project?.rateCents));
  const client = clients.find((c) => c.id === clientId);

  if (!clients.length) return <p className="text-sm text-stone-600">Add a client first.</p>;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = (await saveProject({ id: project?.id, clientId, name, description, rate })) as ActionResult<{ id: number }>;
          if (!r.ok) return setError(r.error);
          router.refresh();
          onDone(r.data?.id);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} disabled={!!project}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
        </Field>
        <Field
          label="Hourly rate override (optional)"
          hint={rate.trim() ? "Overrides the client's rate for this project. Applies to new entries only." : `Leave blank to use the client's rate (${client ? formatCents(client.rateCents) : "—"}/hr).`}
        >
          <span className="flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold focus-within:outline-2 focus-within:outline-accent">
            $
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              aria-label="Rate override in dollars"
              placeholder={client ? toInput(client.rateCents) : ""}
              className="min-w-0 flex-1 outline-none placeholder:font-normal placeholder:text-stone-400"
            />
            /hr
          </span>
        </Field>
      </div>
      <Field label="Description (optional)">
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </Field>
      <ErrorText text={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : project ? "Save project" : "Add project"}
        </Button>
      </div>
    </form>
  );
}

/** A button that opens a modal with a form. */
export function ModalButton({
  label,
  title,
  variant = "secondary",
  defaultOpen = false,
  children,
}: {
  label: React.ReactNode;
  title: string;
  variant?: "primary" | "secondary" | "ghost";
  defaultOpen?: boolean;
  children: (close: (id?: number) => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}

export function NewClientButton({ defaultRateCents, defaultOpen }: { defaultRateCents: number; defaultOpen?: boolean }) {
  const router = useRouter();
  return (
    <ModalButton label="New client" title="New client" variant="primary" defaultOpen={defaultOpen}>
      {(close) => (
        <ClientForm
          defaultRateCents={defaultRateCents}
          onDone={(id) => {
            close();
            if (id) router.push(`/clients/${id}`);
          }}
        />
      )}
    </ModalButton>
  );
}

export function NewProjectButton({
  clients,
  defaultClientId,
  defaultOpen,
  variant = "primary",
  navigate = true,
}: {
  clients: { id: number; name: string; rateCents: number }[];
  defaultClientId?: number | null;
  defaultOpen?: boolean;
  variant?: "primary" | "secondary";
  navigate?: boolean;
}) {
  const router = useRouter();
  return (
    <ModalButton label="New project" title="New project" variant={variant} defaultOpen={defaultOpen}>
      {(close) => (
        <ProjectForm
          clients={clients}
          defaultClientId={defaultClientId}
          onDone={(id) => {
            close();
            if (id && navigate) router.push(`/projects/${id}`);
          }}
        />
      )}
    </ModalButton>
  );
}

export function EditClientButton({ client }: { client: ClientValues }) {
  return (
    <ModalButton label="Edit details" title="Edit client">
      {(close) => <ClientForm client={client} defaultRateCents={client.rateCents} onDone={close} />}
    </ModalButton>
  );
}

export function EditProjectButton({ project, clients }: { project: ProjectValues; clients: { id: number; name: string; rateCents: number }[] }) {
  return (
    <ModalButton label="Edit project" title="Edit project">
      {(close) => <ProjectForm project={project} clients={clients} onDone={close} />}
    </ModalButton>
  );
}

export function ArchiveControls({ kind, id, archived, canDelete }: { kind: "client" | "project"; id: number; archived: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() => run(() => (kind === "client" ? setClientArchivedAction(id, !archived) : setProjectArchivedAction(id, !archived)))}
        >
          {archived ? "Restore" : `Archive ${kind}`}
        </Button>
        {canDelete ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete this ${kind}? This can't be undone.`)) run(() => (kind === "client" ? deleteClientAction(id) : deleteProjectAction(id)));
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <p className={cx("text-xs", error ? "text-red-700" : "text-stone-500")}>
        {error ||
          (archived
            ? `Archived ${kind}s are hidden from pickers but keep all their history.`
            : canDelete
              ? `No time has been logged, so this ${kind} can be deleted.`
              : `Archiving hides it from pickers and keeps its history. ${kind === "client" ? "Clients" : "Projects"} with time can't be deleted.`)}
      </p>
    </div>
  );
}
