/** Format a US phone number as (217) 440-9461; anything else is returned trimmed. */
export function formatPhone(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length === 10 && !/[a-z]/i.test(s)) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
}
