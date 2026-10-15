import { View } from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { actionDetails, actionStatus, actionTitle } from "@sahaay/api-client";
import { api, authClient } from "./auth";
import { Label, Button } from "./ui";
export function ChatApprovals({
  conversationId,
  revision,
  turns,
  children,
}: {
  turns: string[];
  children: (renderAction: (requestId: string) => ReactNode) => ReactNode;
  conversationId: string;
  revision: string;
}) {
  const owner = authClient.useSession().data?.user.id;
  const actions = useQuery({
    queryKey: [owner, "chat-approvals", conversationId],
    queryFn: () => api.approvals(conversationId),
    enabled: !!owner && !!conversationId,
  });
  const refetch = actions.refetch;
  useEffect(() => {
    void refetch();
  }, [revision, refetch]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const lock = useRef(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const future = (actions.data ?? [])
      .filter((a) => a.status === "pending")
      .map((a) => Date.parse(a.expiresAt))
      .filter((time) => time > Date.now());
    if (!future.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(...future) - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [actions.data, clock]);
  async function decide(id: string, decision: "approve" | "cancel") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.approveAction(id, decision);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not confirm the outcome.",
      );
    } finally {
      const result = await refetch();
      if (result.isError) {
        setUncertain((previous) => [...previous, id]);
        setError("Could not verify status. Check Google before trying again.");
      }
      lock.current = false;
      setBusy(false);
    }
  }
  function renderAction(requestId: string) {
    const matching =
      actions.data?.filter(
        (a) =>
          (turns.includes(a.requestId ?? "")
            ? a.requestId
            : turns.find((id) => a.requestIds?.includes(id))) === requestId,
      ) ?? [];
    if (!matching.length)
      return actions.data?.some((a) => a.requestIds?.includes(requestId)) ? (
        <Label muted>
          This action is already shown with its original request.
        </Label>
      ) : null;
    return (
      <>
        {(error || actions.error) && (
          <Label>
            {error ||
              "Could not load action approvals. Refresh before sending again."}
          </Label>
        )}
        {matching.map((a) => {
          const unknown = a.status === "unknown" || uncertain.includes(a.id);
          const active =
            unknown ||
            a.status === "executing" ||
            (a.status === "pending" && Date.parse(a.expiresAt) > clock);
          const status =
            a.status === "pending" && Date.parse(a.expiresAt) <= clock
              ? "Expired"
              : actionStatus(a.status);
          if (!active && a.status !== "succeeded")
            return (
              <Label muted key={a.id}>
                {actionTitle(a.proposal.kind)} · {status}
              </Label>
            );
          const showDetails = active || expanded.includes(a.id);
          return (
            <View key={a.id} style={{ gap: 12 }}>
              <Label>{actionTitle(a.proposal.kind)}</Label>
              <Label>From account: {a.accountEmail}</Label>
              <Label muted>{unknown ? "Outcome uncertain" : status}</Label>
              {!active && (
                <Button
                  secondary
                  title={
                    expanded.includes(a.id) ? "Hide details" : "View details"
                  }
                  onPress={() =>
                    setExpanded((previous) =>
                      previous.includes(a.id)
                        ? previous.filter((id) => id !== a.id)
                        : [...previous, a.id],
                    )
                  }
                />
              )}
              {showDetails && (
                <>
                  {actionDetails(a.proposal, a.preview).map(
                    ([label, value]) => (
                      <Label key={label}>
                        {label}: {value}
                      </Label>
                    ),
                  )}
                  {a.proposal.kind.startsWith("calendar_") && (
                    <Label muted>
                      Google may notify attendees. Review recurring-event scope
                      before approving.
                    </Label>
                  )}
                  {a.status === "pending" && !unknown && (
                    <>
                      <Label muted>
                        Approve before{" "}
                        {new Date(a.expiresAt).toLocaleTimeString()}
                      </Label>
                      <Button
                        title={
                          busy
                            ? "Checking action…"
                            : "Approve " +
                              actionTitle(a.proposal.kind).toLowerCase()
                        }
                        disabled={busy || Date.parse(a.expiresAt) <= clock}
                        onPress={() => void decide(a.id, "approve")}
                      />
                      <Button
                        secondary
                        title="Cancel action"
                        disabled={busy}
                        onPress={() => void decide(a.id, "cancel")}
                      />
                    </>
                  )}
                  {unknown && (
                    <Label>
                      Check Gmail or Calendar before trying again. Sahaay will
                      not resend automatically.
                    </Label>
                  )}
                  <Label muted>
                    Approval expires after 10 minutes. This encrypted action
                    record is retained for up to 7 days.
                  </Label>
                </>
              )}
            </View>
          );
        })}
      </>
    );
  }
  return (
    <>
      {error && <Label>{error}</Label>}
      {children(renderAction)}
    </>
  );
}
