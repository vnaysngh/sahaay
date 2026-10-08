import { verificationRequired } from "@/auth/email";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import { Chat } from "@/components/chat";
export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (verificationRequired() && !session.user.emailVerified))
    redirect("/sign-in");
  return <Chat name={session.user.name} />;
}
