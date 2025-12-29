import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DisplayNameForm from "@/components/account/display-name-form";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Display name</h2>
        <p className="text-sm text-muted-foreground">
          This is what other players will see on leaderboards and picks.
        </p>
        <DisplayNameForm initialValue={user.displayName ?? user.name ?? ""} />
      </section>
    </main>
  );
}
