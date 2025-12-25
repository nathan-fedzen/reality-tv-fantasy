"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export default function LogoutButton({
  className = "",
  label = "Log out",
}: {
  className?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    // callbackUrl sends you somewhere predictable after logout
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className={className}
      aria-label={label}
    >
      {loading ? "Logging out..." : label}
    </button>
  );
}
