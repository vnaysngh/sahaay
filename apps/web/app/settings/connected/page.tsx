import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import { verificationRequired } from "@/auth/email";
import { ConnectedAccounts } from "@/components/connected-accounts";
export const dynamic = "force-dynamic";
export default async function ConnectedPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (verificationRequired() && !session.user.emailVerified))
    redirect("/sign-in");
  return (
    <main className="state-screen">
      <section className="state-intro">
        <p className="state-eyebrow">SETTINGS</p>
        <h1>Connected Accounts</h1>
        <p>Gmail and Google Calendar, through your shared Sahaay account.</p>
      </section>
      <ConnectedAccounts />
    </main>
  );
}
