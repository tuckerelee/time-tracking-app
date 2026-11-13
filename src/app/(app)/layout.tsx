import { requireAuth } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getTimer } from "@/server/timer";
import { getPickerOptions } from "@/server/projects";
import { NavLinks } from "@/components/nav-links";
import { TimerWidget } from "@/components/timer-widget";
import { logout } from "@/app/actions/auth";
import { isDemoMode } from "@/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const settings = getSettings();
  const timer = getTimer();
  const clients = getPickerOptions();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 border-b border-stone-200 bg-white px-3.5 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r lg:border-b-0 lg:py-5">
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{settings.businessName || "Ledger"}</span>
            <span className="text-xs text-stone-500">Ledger</span>
          </div>
          <form action={logout} className="lg:hidden">
            <button className="text-xs text-stone-500 hover:text-stone-900">Sign out</button>
          </form>
        </div>
        <NavLinks />
        <div className="lg:mt-auto">
          <TimerWidget timer={timer} serverNow={Date.now()} clients={clients} />
        </div>
        <form action={logout} className="hidden px-2 lg:block">
          <button className="text-xs text-stone-500 hover:text-stone-900">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-8 lg:px-12 lg:pt-9">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
          {isDemoMode() ? (
            <p className="rounded-lg border border-accent-line bg-accent-soft px-4 py-2.5 text-[13px] text-accent-hover">
              <span className="font-semibold">Demo</span> · Sample data. Feel free to change anything; the demo can reset to sample data at any time.
            </p>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
