import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./ui";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <LoginForm />;
}
