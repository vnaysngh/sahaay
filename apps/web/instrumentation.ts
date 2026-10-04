export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  const { getPool } = await import("./src/db");
  const { PostgresConversations } = await import("./src/db/conversations");
  const store = new PostgresConversations(getPool());
  await store.cleanup();
  const globals = globalThis as typeof globalThis & {
    sahaayCleanup?: NodeJS.Timeout;
  };
  if (!globals.sahaayCleanup) {
    // Operational retention cleanup, not a product workflow or a separate service.
    globals.sahaayCleanup = setInterval(
      () => {
        void store
          .cleanup()
          .catch(() => console.error("Retention cleanup unavailable"));
      },
      60 * 60 * 1000,
    );
    globals.sahaayCleanup.unref();
  }
}
