"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/db/schema";
import { saveSettings } from "@/app/actions/data";
import { reportFilename } from "@/lib/filename";
import { Button, Card, Field, Input, Select, cx } from "@/components/ui";

const ZONES = [
  ["America/Chicago", "Central — America/Chicago"],
  ["America/New_York", "Eastern — America/New_York"],
  ["America/Denver", "Mountain — America/Denver"],
  ["America/Phoenix", "Arizona — America/Phoenix"],
  ["America/Los_Angeles", "Pacific — America/Los_Angeles"],
  ["America/Anchorage", "Alaska — America/Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Pacific/Honolulu"],
  ["UTC", "UTC"],
];

export function SettingsForm({ settings, exampleRange }: { settings: Settings; exampleRange: { from: string; to: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [v, setV] = useState({
    businessName: settings.businessName,
    email: settings.email,
    phone: settings.phone,
    address: settings.address,
    website: settings.website,
    reportFooter: settings.reportFooter,
    filenameSuffix: settings.filenameSuffix,
    defaultRate: (settings.defaultRateCents / 100).toFixed(2),
    timezone: settings.timezone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    showTimesOnReports: settings.showTimesOnReports,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const zones = ZONES.some(([z]) => z === v.timezone) ? ZONES : [[v.timezone, v.timezone], ...ZONES];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await saveSettings(v);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: "Settings saved" });
          router.refresh();
        });
      }}
    >
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Business details</h2>
          <p className="text-xs text-stone-500">Shown in the header of every report.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={v.businessName} onChange={set("businessName")} maxLength={200} />
          </Field>
          <Field label="Email">
            <Input type="email" value={v.email} onChange={set("email")} maxLength={200} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={v.phone} onChange={set("phone")} maxLength={50} />
          </Field>
          <Field label="Website (optional)">
            <Input value={v.website} onChange={set("website")} maxLength={200} />
          </Field>
          <Field label="Mailing address" className="sm:col-span-2">
            <Input value={v.address} onChange={set("address")} maxLength={500} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-[15px] font-semibold">Reports</h2>
        <Field label="Footer line">
          <Input value={v.reportFooter} onChange={set("reportFooter")} maxLength={500} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Filename suffix">
            <Input value={v.filenameSuffix} onChange={set("filenameSuffix")} maxLength={40} />
          </Field>
          <div className="flex flex-col gap-1.5 text-xs font-medium text-stone-600">
            Example
            <code className="flex min-h-10 items-center rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs font-normal break-all text-stone-700">
              {reportFilename({ clientName: "Client Name", from: exampleRange.from, to: exampleRange.to, suffix: v.filenameSuffix, ext: "pdf" })}
            </code>
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4" checked={v.showTimesOnReports} onChange={(e) => setV({ ...v, showTimesOnReports: e.target.checked })} />
          <span>
            <span className="font-medium">Show start &amp; end times on reports by default</span>
            <span className="block text-xs text-stone-500">You can still turn this off for a single report.</span>
          </span>
        </label>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-[15px] font-semibold">Billing &amp; formats</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default hourly rate" hint="New clients start at this rate. Changing it never changes existing clients or logged time.">
            <span className="flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold focus-within:outline-2 focus-within:outline-accent">
              $<input value={v.defaultRate} onChange={set("defaultRate")} inputMode="decimal" aria-label="Default hourly rate in dollars" className="min-w-0 flex-1 outline-none" />
              /hr
            </span>
          </Field>
          <Field label="Timezone" hint="Used for “today”, date presets and timer times.">
            <Select value={v.timezone} onChange={set("timezone")}>
              {zones.map(([z, label]) => (
                <option key={z} value={z}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={v.dateFormat} onChange={set("dateFormat")}>
              <option value="medium">Nov 9, 2026</option>
              <option value="us">11/09/2026</option>
            </Select>
          </Field>
          <Field label="Time format">
            <Select value={v.timeFormat} onChange={set("timeFormat")}>
              <option value="12short">1:30p</option>
              <option value="12">1:30 PM</option>
              <option value="24">13:30</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-4">
        {msg ? (
          <p role="status" className={cx("text-[13px]", msg.ok ? "text-accent" : "text-red-700")}>
            {msg.text}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
