import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Logged in as {session.user?.email}
      </p>
      <SignOutButton />
    </main>
  );
}
