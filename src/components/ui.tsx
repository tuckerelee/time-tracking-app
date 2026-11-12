import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-transparent",
  secondary: "bg-white text-stone-900 border border-stone-200 hover:bg-stone-50 hover:border-stone-300",
  ghost: "bg-transparent text-stone-600 border border-transparent hover:bg-stone-100 hover:text-stone-900",
  danger: "bg-white text-red-700 border border-stone-200 hover:bg-red-50 hover:border-red-200",
  dark: "bg-stone-900 text-white border border-transparent hover:bg-stone-800",
};
const sizes = { sm: "h-9 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-sm" };

export function buttonClass(variant: Variant = "secondary", size: keyof typeof sizes = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export const inputBase =
  "h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 disabled:bg-stone-50 disabled:text-stone-500";
export const inputClass = `${inputBase} w-full`;

/** `fit` sizes the control to its content instead of filling the row. */
export function Input({ className, fit, ...props }: ComponentProps<"input"> & { fit?: boolean }) {
  return <input className={cx(fit ? inputBase : inputClass, className)} {...props} />;
}

export function Select({ className, fit, ...props }: ComponentProps<"select"> & { fit?: boolean }) {
  return <select className={cx(fit ? inputBase : inputClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "h-auto py-2 leading-relaxed", className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-xs font-medium text-stone-600", className)}>
      <span>{label}</span>
      {children}
      {hint ? <span className="font-normal text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-xl border border-stone-200 bg-white", className)} {...props} />;
}

export function CardHeader({ title, action, id }: { title: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
      <h2 id={id} className="text-[15px] font-semibold">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumb ? <div className="text-[13px] text-stone-500">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-[13px] text-stone-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Stat({ label, value, sub, tone = "plain" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "plain" | "accent" }) {
  return (
    <div
      className={cx(
        "flex flex-col gap-1.5 rounded-xl border px-5 py-4",
        tone === "accent" ? "border-accent-line bg-accent-soft" : "border-stone-200 bg-white",
      )}
    >
      <span className={cx("text-xs font-medium", tone === "accent" ? "font-semibold text-accent" : "text-stone-500")}>{label}</span>
      <span className="text-[24px] font-semibold tracking-tight">{value}</span>
      {sub ? <span className={cx("text-[13px]", tone === "accent" ? "text-accent-hover" : "text-stone-600")}>{sub}</span> : null}
    </div>
  );
}

export function StatusBadge({ status, invoiceRef }: { status: "uninvoiced" | "invoiced"; invoiceRef?: string | null }) {
  if (status === "invoiced") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5 text-xs">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700">Invoiced</span>
        {invoiceRef ? <span className="text-stone-500">{invoiceRef}</span> : null}
      </span>
    );
  }
  return <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">Uninvoiced</span>;
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-stone-100 text-stone-600",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {children ? <div className="text-[13px] text-stone-500">{children}</div> : null}
    </div>
  );
}

export function TableWrap({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export const th = "px-3 py-2.5 text-left text-xs font-medium text-stone-500 first:pl-5 last:pr-5";
export const td = "px-3 py-3 align-top first:pl-5 last:pr-5";
