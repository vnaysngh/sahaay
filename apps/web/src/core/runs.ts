// Single-process cancellation complements PostgreSQL lifecycle checks; no queue/service.
const globals = globalThis as typeof globalThis & {
  sahaayRuns?: Map<
    string,
    { owner: string; conversation: string; controller: AbortController }
  >;
};
function registry() {
  return (globals.sahaayRuns ??= new Map());
}
export function registerRun(
  owner: string,
  conversation: string,
  requestId: string,
) {
  const controller = new AbortController();
  registry().set(requestId, { owner, conversation, controller });
  return {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
    close: () => registry().delete(requestId),
  };
}
export function cancelRuns(owner: string, conversation?: string) {
  for (const run of registry().values())
    if (
      run.owner === owner &&
      (!conversation || run.conversation === conversation)
    )
      run.controller.abort();
}
