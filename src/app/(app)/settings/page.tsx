import { getSettings } from "@/server/settings";
import { presetRange, todayIn } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Settings" />
      <SettingsForm settings={s} exampleRange={presetRange("thisMonth", todayIn(s.timezone))} />
    </div>
  );
}
