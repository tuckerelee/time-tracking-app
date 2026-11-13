import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Settings" />
      <SettingsForm settings={s} />
    </div>
  );
}
