"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(24, "Display name must be 24 characters or less.")
    .regex(/^[a-zA-Z0-9 _.-]+$/, "Only letters, numbers, spaces, _ . - allowed."),
});

export async function updateDisplayName(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const raw = String(formData.get("displayName") ?? "");
  const parsed = schema.safeParse({ displayName: raw });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName },
  });

  revalidatePath("/account");
  revalidatePath("/leagues"); // optional: if you show names there
  return { ok: true };
}
