"use client";

import { useActionState } from "react";

import { joinGameAction, type JoinGameState } from "@/app/actions/team";

const initialState: JoinGameState = null;

type Props = {
  initialCode?: string;
};

export function JoinForm({ initialCode = "" }: Props) {
  const [state, formAction, pending] = useActionState(
    joinGameAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
        Game code
        <input
          name="joinCode"
          type="text"
          required
          defaultValue={initialCode}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABC123"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-base uppercase tracking-widest text-zinc-900 outline-none ring-amber-600 focus:ring-2"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">
        Team name
        <input
          name="teamName"
          type="text"
          required
          maxLength={40}
          placeholder="Quizzy McQuizface"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none ring-amber-600 focus:ring-2"
        />
      </label>
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
        {pending ? "Joining…" : "Join game"}
      </button>
    </form>
  );
}
