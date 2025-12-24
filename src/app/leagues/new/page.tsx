import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import CreateLeagueForm from "./ui";

export default async function NewLeaguePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      <h1 className="text-2xl font-semibold">Create League</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set up a league and share an invite link with friends.
      </p>

      <div className="mt-6">
        <CreateLeagueForm />
      </div>
    </main>
  );
}
