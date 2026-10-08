import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import { verificationRequired } from "@/auth/email";
import { Documents } from "@/components/documents";
export const dynamic = "force-dynamic";
export default async function DocumentsPage() {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s || (verificationRequired() && !s.user.emailVerified))
    redirect("/sign-in");
  return (
    <main className="state-screen">
      <section className="state-intro">
        <p className="state-eyebrow">KEPT BY YOU</p>
        <h1>Documents</h1>
        <p>Images you explicitly asked Sahaay to keep. Originals included.</p>
      </section>
      <Documents />
    </main>
  );
}
