import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getAuth } from "@/auth";
import { verificationRequired } from "@/auth/email";
import { getPool } from "@/db";
import { lifeState } from "@/db/life-state";
import { PersonalState } from "@/components/personal-state";
import { stateDetails } from "@/components/state-categories";
export const dynamic = "force-dynamic";
export default async function State({
  searchParams,
}: {
  searchParams: Promise<{ object?: string; page?: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (verificationRequired() && !session.user.emailVerified))
    redirect("/sign-in");
  const params = await searchParams;
  const state = await lifeState(
    getPool(),
    session.user.id,
    params.object,
    Number(params.page ?? 0),
    500,
  );
  if (!state) notFound();
  const href = (page: number) =>
    `/state?${new URLSearchParams({ ...(params.object ? { object: params.object } : {}), page: String(page) })}`;
  return (
    <main className="state-screen">
      <section className="state-intro">
        <p className="state-eyebrow">MY STATE</p>
        <h1>{state.parent?.content ?? "Your space"}</h1>
        <p>
          {state.parent
            ? `${state.parent.stateLabel ?? state.parent.status} · ${state.parent.kind}`
            : "Your plans, ideas and saved things. All in one place."}
        </p>
        {state.parent && (
          <>
            <p className="state-parent-details">
              {stateDetails(state.parent.structuredValue).join(" · ")}
            </p>
            <Link href="/state" prefetch={false}>
              ← All my state
            </Link>
          </>
        )}
      </section>
      <PersonalState
        key={params.object ?? "overview"}
        records={state.records.map((r) => ({
          ...r,
          updatedAt: new Date(r.updatedAt).toISOString(),
        }))}
        memories={state.memories}
        objectView={Boolean(state.parent)}
      />
      <nav className="state-pages">
        {state.page > 0 && (
          <Link href={href(state.page - 1)} prefetch={false}>
            ← Previous
          </Link>
        )}
        {state.hasNext && (
          <Link href={href(state.page + 1)} prefetch={false}>
            More →
          </Link>
        )}
      </nav>
      <footer className="state-footer">
        Ask Sahaay to change, archive or delete anything here.{" "}
        <Link href="/privacy">Your data</Link>
      </footer>
    </main>
  );
}
