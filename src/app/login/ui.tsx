"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginForm() {
  const [email, setEmail] = useState("");

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We’ll email you a magic link.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await signIn("email", { email, callbackUrl: "/dashboard" });
        }}
      >
        <input
          className="w-full rounded-md border px-3 py-2"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="w-full rounded-md bg-black px-3 py-2 text-white">
          Send magic link
        </button>
      </form>
    </main>
  );
}
