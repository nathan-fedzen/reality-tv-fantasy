import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppNav from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppNav userName={user.name ?? user.email ?? "User"} />
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}
