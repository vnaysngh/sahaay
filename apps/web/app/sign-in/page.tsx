import { SignIn } from "@/components/sign-in";
import { emailConfigured, verificationRequired } from "@/auth/email";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <SignIn
      verification={verificationRequired()}
      recovery={
        emailConfigured() || process.env.SAHAAY_AUTH_EMAIL_CAPTURE === "1"
      }
      notice={
        params.verified === "1"
          ? "Email verified. You can sign in now."
          : params.error
            ? "This link is invalid or expired. Request a new verification email by signing in."
            : ""
      }
    />
  );
}
