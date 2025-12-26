import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const from = provider.from ?? process.env.EMAIL_FROM;
        if (!from) throw new Error("Missing EMAIL_FROM");
        if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

        await resend.emails.send({
          from,
          to: identifier,
          subject: "Sign in to Reality TV Fantasy",
          html: `
          <div style="font-family: ui-sans-serif, system-ui; line-height: 1.5;">
            <h2>Sign in</h2>
            <p>Click the link below to sign in:</p>
            <p><a href="${url}">${url}</a></p>
            <p style="color:#666;font-size:12px;">
              If you didn’t request this, you can ignore this email.
            </p>
          </div>
        `,
        });
      },
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify",
  },
  debug: true,
};
