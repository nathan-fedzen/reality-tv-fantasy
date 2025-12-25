import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export function getSession() {
  return getServerSession(authOptions);
}

type AppUser = {
  id: string;
  email: string;
  name: string | null;
};

function devBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true";
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (devBypassEnabled()) {
    const email = process.env.DEV_AUTH_EMAIL ?? "dev@nathan.local";
    return { id: "dev-user", email, name: "Dev User" };
  }

  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  // If your Prisma schema allows email to be nullable, enforce it here:
  if (!user?.email) return null;

  return { id: user.id, email: user.email, name: user.name };
}
