import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/auth";
import { verificationRequired } from "@/auth/email";
import { getPool } from "@/db";
import { ConnectTelegram } from "@/components/connect-telegram";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (verificationRequired() && !session.user.emailVerified))
    redirect("/sign-in");
  const linked = Boolean(
    (
      await getPool().query(
        "SELECT user_id FROM telegram_links WHERE user_id=$1",
        [session.user.id],
      )
    ).rowCount,
  );
  return (
    <ConnectTelegram
      linked={linked}
      username={process.env.TELEGRAM_BOT_USERNAME ?? ""}
    />
  );
}
