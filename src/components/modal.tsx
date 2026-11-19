"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      // Closes only via the × button, a Cancel button or Esc. Clicking outside
      // does nothing: some browsers and autofill extensions report clicks inside
      // form fields as clicks on the backdrop, which closed forms mid-edit.
      onClose={onClose}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl`}
    >
      {open ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
