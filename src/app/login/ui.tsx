"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          setSubmitting(true);
          setError(null);

          try {
            const result = await signIn("email", {
              email,
              callbackUrl: "/dashboard",
              redirect: false,
            });

            if (!result) {
              setError("No response from auth service. Please try again.");
              return;
            }

            if (result.error) {
              setError("Sign-in failed. Check server logs for /api/auth/signin/email.");
              return;
            }

            router.push("/verify");
          } catch {
            setError("Sign-in request failed. Please try again.");
          } finally {
            setSubmitting(false);
          }
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
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button className="w-full rounded-md bg-black px-3 py-2 text-white">
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
    </main>
  );
}
