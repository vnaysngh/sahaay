import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import { verificationRequired } from "@/auth/email";
import { Inbox } from "@/components/inbox";
export const dynamic = "force-dynamic";
export default async function InboxPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (verificationRequired() && !session.user.emailVerified))
    redirect("/sign-in");
  return (
    <main className="state-screen">
      <section className="state-intro">
        <p className="state-eyebrow">FOLLOW-UPS</p>
        <h1>Inbox</h1>
        <p>Things you asked Sahaay to bring back.</p>
      </section>
      <Inbox />
    </main>
  );
}
