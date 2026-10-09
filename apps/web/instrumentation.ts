export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  // Render remains the sole scheduler when a local client shares its database.
  if (process.env.SAHAAY_BACKGROUND_JOBS === "0") return;
  const { getPool } = await import("./src/db");
  const { PostgresConversations } = await import("./src/db/conversations");
  const store = new PostgresConversations(getPool());
  const { Attachments } = await import("./src/media/attachments");
  const media = new Attachments(getPool());
  const { DeletionJournal } = await import("./src/privacy/journal");
  const journal = new DeletionJournal();
  await journal.cleanup();
  await store.cleanup();
  await media.cleanup();
  const globals = globalThis as typeof globalThis & {
    sahaayCleanup?: NodeJS.Timeout;
    sahaayFollowups?: NodeJS.Timeout;
  };
  if (!globals.sahaayFollowups) {
    const { FollowupWorker } = await import("./src/core/followup-worker");
    const { telegramFollowupNotifier } =
      await import("./src/channels/telegram/followups");
    const { TelegramApi } = await import("./src/channels/telegram/api");
    const { verificationRequired } = await import("./src/auth/email");
    const worker = new FollowupWorker(
      getPool(),
      process.env.SAHAAY_E2E !== "1" && process.env.TELEGRAM_BOT_TOKEN
        ? telegramFollowupNotifier(
            new TelegramApi(process.env.TELEGRAM_BOT_TOKEN),
          )
        : null,
      verificationRequired(),
    );
    const { MobilePushDelivery, ExpoPushTransport } =
      await import("./src/channels/mobile/push");
    const push =
      process.env.SAHAAY_EXPO_PROJECT_ID && process.env.SAHAAY_E2E !== "1"
        ? new MobilePushDelivery(
            getPool(),
            new ExpoPushTransport(process.env.SAHAAY_EXPO_ACCESS_TOKEN),
            verificationRequired(),
          )
        : null;
    let busy = false,
      pushBusy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        await worker.tick();
        if (push && !pushBusy) {
          pushBusy = true;
          // Slow best-effort push transport must not delay the authoritative M7 due tick.
          void push
            .tick()
            .catch(() =>
              console.error("Mobile notification delivery unavailable"),
            )
            .finally(() => {
              pushBusy = false;
            });
        }
      } catch {
        console.error("Follow-up worker unavailable");
      } finally {
        busy = false;
      }
    };
    // Notification catch-up must not block the server becoming available.
    void tick();
    globals.sahaayFollowups = setInterval(() => void tick(), 30000);
    globals.sahaayFollowups.unref();
  }
  if (!globals.sahaayCleanup) {
    // Operational retention cleanup, not a product workflow or a separate service.
    globals.sahaayCleanup = setInterval(() => {
      void store
        .cleanup()
        .then(() => media.cleanup())
        .then(() => journal.cleanup())
        .catch(() => console.error("Retention cleanup unavailable"));
    }, 60 * 1000);
    globals.sahaayCleanup.unref();
  }
}
