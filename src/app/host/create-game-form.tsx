"use client";

import { useActionState } from "react";

import {
  createGameAction,
  type CreateGameState,
} from "@/app/actions/host";

const initialState: CreateGameState = null;

type Props = {
  submitLabel?: string;
  replaceSessionWarning?: boolean;
};

export function CreateGameForm({
  submitLabel = "Create game",
  replaceSessionWarning = false,
}: Props) {
  const [state, formAction, pending] = useActionState(
    createGameAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
        Game name
        <input
          name="title"
          type="text"
          required
          maxLength={80}
          placeholder="Thursday Pub Trivia"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none ring-amber-600 focus:ring-2"
        />
      </label>
      {replaceSessionWarning ? (
        <p className="text-sm text-zinc-600">
          Creating a new game replaces this browser&apos;s current host session.
          Use Resume above to return to your existing lobby.
        </p>
      ) : null}
      {state?.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
      >
        {pending ? "Creating…" : submitLabel}
      </button>
    </form>
  );
}
