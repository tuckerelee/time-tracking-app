"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Password">
        <Input type="password" name="password" autoComplete="current-password" required autoFocus />
      </Field>
      {state.error ? (
        <p role="alert" className="text-[13px] text-red-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
