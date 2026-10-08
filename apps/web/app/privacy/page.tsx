import Link from "next/link";
export default function Privacy() {
  return (
    <main className="auth-screen">
      <article className="auth-card privacy-copy">
        <h1>Your data in Sahaay.</h1>
        <p>
          Sahaay uses your messages, recent conversation and relevant explicitly
          saved facts/items and personal plans to answer you. It doesn’t infer a
          permanent personal profile from every message.
        </p>
        <ul>
          <li>
            If you connect Telegram, Telegram also processes and retains its own
            messages/media. Account linking uses a private, expiring single-use
            link. Disconnecting stops Telegram access; deleting Sahaay data does
            not erase Telegram’s chat copies.
          </li>
          <li>
            Ordinary images and audio expire after 24 hours. Explicitly kept
            image Documents retain the received original and extracted
            understanding until you delete them. Conversations and transcripts
            expire after 7 days.
          </li>
          <li>
            Explicit memories, saved items and personal state stay until you ask
            to change or delete them. “Forget” removes that fact and its saved
            versions; visible conversation history has its own retention.
          </li>
          <li>
            OpenAI processes messages, images, relevant recalled facts and
            public research. Sarvam processes voice recordings for
            transcription. Provider retention is separate from Sahaay’s
            retention; this preview does not promise zero retention or
            India-only processing.
          </li>
          <li>
            When you tell Sahaay about a current plan, idea, purchase or
            something you are considering, it can keep that state and organize
            related items. Preferences still require an explicit request to
            remember. You can ask to change or delete state in chat. It does not
            save every incidental mention or automatically extract a profile.
          </li>
          <li>
            Follow-ups are created only when you explicitly request a reminder.
            They stay in your Inbox independently of Telegram delivery.
            Scheduled and ready reminders remain until you close them;
            completed, dismissed or cancelled reminders expire after 30 days.
            Deleting chats does not cancel reminders. Deleting related state
            cancels its reminders. Pause also suspends delivery; overdue
            reminders resume when you unpause.
          </li>
          <li>
            Usage events record only coarse state activity, capability, input
            type, language bucket and success/failure. They contain no prompts,
            URLs, transcripts or media and expire after 30 days. They are linked
            internally to your account and disappear on account deletion.
          </li>
          <li>
            You can pause the assistant, delete chats or delete your account
            from Privacy in the conversation window. Pausing stops new
            processing and discards pending results; it cannot recall data
            already sent to a provider.
          </li>
          <li>
            Deleting chats doesn’t delete separately remembered facts or saved
            items, Documents or reminders. Account deletion removes these, your
            history and sessions, and access to your uploaded media.
          </li>
          <li>
            Encrypted database backups, when configured, expire within 30 days.
            Temporary media is excluded from recovery. Encrypted durable
            Document originals and extraction are included in database backups.
            Content-free deletion IDs are retained for 31 days outside database
            backups to prevent deleted data returning on restore.
          </li>
        </ul>
        <p>
          Avoid sending passwords or authentication codes. Image Documents are
          private to your account and encrypted at rest. Opening or returning an
          original is audited without logging its contents. Deletion removes the
          stored original, extraction and related links; independent
          Telegram/provider copies and backups have separate retention.
          PDF/audio/video Documents, shared location, background tracking and
          external actions aren’t supported in this release.
        </p>
        <Link href="/">Back to Sahaay</Link>
      </article>
    </main>
  );
}
