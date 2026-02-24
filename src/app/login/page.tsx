import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./ui";

function normalizeCallbackUrl(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/dashboard";

  // Only allow same-site relative paths to avoid open redirects.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const search = await searchParams;
  const callbackUrl = normalizeCallbackUrl(search.callbackUrl);
  const session = await getSession();
  if (session) redirect(callbackUrl);
  return <LoginForm callbackUrl={callbackUrl} />;
}
