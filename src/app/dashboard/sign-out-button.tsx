"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      className="mt-6 rounded-md border px-3 py-2"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </button>
  );
}
