import {
  pgTable,
  customType,
  bigint,
  primaryKey,
  integer,
  doublePrecision,
  jsonb,
  text,
  timestamp,
  boolean,
  uuid,
  unique,
  foreignKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  timezone: text("timezone"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  processingPaused: boolean("processing_paused").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: time("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("session_owner").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_owner").on(t.userId)],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier").on(t.identifier)],
);
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("conversation_owned_id").on(t.id, t.userId),
    index("conversation_history").on(t.userId, t.updatedAt),
  ],
);
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    requestId: uuid("request_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    contextRecordSourceIds: uuid("context_record_source_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: time("created_at").notNull().defaultNow(),
    completedAt: time("completed_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.conversationId, t.userId],
      foreignColumns: [conversations.id, conversations.userId],
    }).onDelete("cascade"),
    unique("message_owned_id").on(t.id, t.userId),
    unique("message_request_role").on(t.userId, t.requestId, t.role),
    uniqueIndex("one_running_turn")
      .on(t.conversationId)
      .where(sql`${t.status} = 'running'`),
    index("message_history").on(t.conversationId, t.createdAt),
    index("message_user_quota")
      .on(t.userId, t.createdAt)
      .where(sql`${t.role}='user'`),
    check("message_role", sql`${t.role} IN ('user', 'assistant')`),
    check(
      "message_status",
      sql`${t.status} IN ('running', 'complete', 'failed', 'interrupted')`,
    ),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id"),
    conversationId: uuid("conversation_id"),
    kind: text("kind").notNull(),
    originalImage: binary("original_image"),
    originalMime: text("original_mime"),
    originalBytes: integer("original_bytes"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: doublePrecision("duration"),
    transcript: text("transcript"),
    providerMetadata: jsonb("provider_metadata"),
    createdAt: time("created_at").notNull().defaultNow(),
    expiresAt: time("expires_at")
      .notNull()
      .default(sql`now()+interval '24 hours'`),
  },
  (t) => [
    unique("attachment_owned_id").on(t.id, t.userId),
    foreignKey({
      columns: [t.messageId, t.userId],
      foreignColumns: [messages.id, messages.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.conversationId, t.userId],
      foreignColumns: [conversations.id, conversations.userId],
    }).onDelete("cascade"),
    index("attachment_message").on(t.messageId),
    index("attachment_owner_created").on(t.userId, t.createdAt),
    index("attachment_expiry").on(t.expiresAt),
    check("attachment_kind", sql`${t.kind} IN ('image','audio')`),
    check("attachment_bytes", sql`${t.bytes}>0`),
  ],
);

export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull(),
    sourceKey: text("source_key").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    retrievedAt: time("retrieved_at").notNull(),
    publishedAt: time("published_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.messageId, t.userId],
      foreignColumns: [messages.id, messages.userId],
    }).onDelete("cascade"),
    unique("research_sources_message_id_source_key_key").on(
      t.messageId,
      t.sourceKey,
    ),
    index("research_source_message").on(t.messageId, t.userId),
    check(
      "research_sources_kind_check",
      sql`${t.kind} IN ('cited','consulted')`,
    ),
  ],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    memoryKey: text("memory_key").notNull(),
    type: text("type").notNull(),
    category: text("category"),
    content: text("content").notNull(),
    structuredValue: jsonb("structured_value"),
    sourceType: text("source_type").notNull().default("user_explicit"),
    sourceId: uuid("source_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    scope: text("scope").notNull().default("personal"),
    validFrom: time("valid_from").notNull().defaultNow(),
    validUntil: time("valid_until"),
    supersedesId: uuid("supersedes_id"),
    version: integer("version").notNull().default(1),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("memories_id_user_id_key").on(t.id, t.userId),
    foreignKey({
      columns: [t.supersedesId, t.userId],
      foreignColumns: [t.id, t.userId],
    }),
    uniqueIndex("memory_current")
      .on(t.userId, t.scope, t.memoryKey)
      .where(sql`${t.validUntil} IS NULL`),
    index("memory_lookup").on(t.userId, t.scope, t.updatedAt),
    check("memories_type_check", sql`${t.type} IN ('semantic','episodic')`),
    check(
      "memories_memory_key_check",
      sql`length(${t.memoryKey}) BETWEEN 1 AND 100`,
    ),
    check(
      "memories_content_check",
      sql`length(${t.content}) BETWEEN 1 AND 1000`,
    ),
    check("memories_source_type_check", sql`${t.sourceType}='user_explicit'`),
    check("memories_confidence_check", sql`${t.confidence}=1`),
    check("memories_version_check", sql`${t.version}>0`),
    check(
      "memories_check",
      sql`${t.validUntil} IS NULL OR ${t.validUntil}>=${t.validFrom}`,
    ),
  ],
);
export const savedItems = pgTable(
  "saved_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recordRole: text("record_role").notNull().default("item"),
    parentId: uuid("parent_id"),
    stateLabel: text("state_label"),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    structuredValue: jsonb("structured_value"),
    listLabel: text("list_label"),
    status: text("status").notNull().default("saved"),
    sourceType: text("source_type").notNull().default("user_explicit"),
    sourceId: uuid("source_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("saved_item_owned_id").on(t.id, t.userId),
    foreignKey({
      columns: [t.parentId, t.userId],
      foreignColumns: [t.id, t.userId],
    }),
    index("item_parent").on(t.userId, t.parentId, t.updatedAt),
    check("saved_item_role", sql`${t.recordRole} IN ('item','object')`),
    check(
      "saved_item_state",
      sql`${t.stateLabel} IS NULL OR length(${t.stateLabel}) BETWEEN 1 AND 60`,
    ),
    check(
      "saved_item_parent_shape",
      sql`${t.parentId} IS NULL OR (${t.recordRole}='item' AND ${t.parentId}<>${t.id})`,
    ),
    // Migration adds the parent-role trigger and column-specific ON DELETE SET NULL.
    index("item_lookup").on(t.userId, t.listLabel, t.updatedAt),
    check(
      "saved_items_content_check",
      sql`length(${t.content}) BETWEEN 1 AND 2000`,
    ),
    check(
      "saved_items_status_check",
      sql`${t.status} IN ('saved','done','archived')`,
    ),
    check(
      "saved_items_source_type_check",
      sql`${t.sourceType}='user_explicit'`,
    ),
    check("saved_items_version_check", sql`${t.version}>0`),
  ],
);
export const recordMutations = pgTable(
  "record_mutations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    actionId: text("action_id").notNull(),
    operation: text("operation").notNull(),
    targetId: uuid("target_id").notNull(),
    version: integer("version").notNull(),
    suppressedSourceIds: uuid("suppressed_source_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: time("created_at").notNull().defaultNow(),
    expiresAt: time("expires_at")
      .notNull()
      .default(sql`now()+interval '30 days'`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.requestId, t.actionId] }),
    index("mutation_expiry").on(t.expiresAt),
    check(
      "record_mutations_operation_check",
      sql`${t.operation} IN ('remember','update_memory','forget','save','update_item','remove_item','followup_create','followup_update','followup_cancel','followup_done','artifact_create','artifact_delete','artifact_original')`,
    ),
  ],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const productEvents = pgTable(
  "product_events",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    behaviors: text("behaviors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    intents: text("intents").array().notNull(),
    modalities: text("modalities").array().notNull(),
    language: text("language").notNull(),
    outcome: text("outcome").notNull(),
    unsupportedTarget: text("unsupported_target"),
    unsupportedCategory: text("unsupported_category"),
    unsupportedCapability: text("unsupported_capability"),
    channel: text("channel"),
    errorClass: text("error_class"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.requestId] }),
    index("product_event_expiry").on(t.createdAt),
    check(
      "product_event_behaviors",
      sql`${t.behaviors}<@ARRAY['state_created','state_revisited','state_updated','memory_created','memory_recalled','saved_item_created','unsupported_action','followup_created','followup_rescheduled','followup_triggered','followup_delivered','followup_opened','followup_completed','followup_dismissed','followup_cancelled','inbox_viewed','inbox_item_opened','artifact_created','artifact_accessed','artifact_retrieved','artifact_original_retrieved','artifact_searched','artifact_deleted','artifact_linked_to_state']::text[]`,
    ),
    check(
      "unsupported_capability",
      sql`${t.unsupportedCapability} ~ '^[a-z][a-z0-9_]{0,79}$'`,
    ),
    check("event_channel", sql`${t.channel} IN ('web','telegram')`),
    check(
      "unsupported_action_category",
      sql`${t.unsupportedCategory} IN ('travel','shopping','money','creator','productivity','fitness','communication','monitoring','other')`,
    ),
    check(
      "product_events_intents_check",
      sql`${t.intents}<@ARRAY['ask','understand','research','compare','remember','recall','organize']::text[]`,
    ),
    check(
      "product_events_modalities_check",
      sql`${t.modalities}<@ARRAY['text','image','voice','url']::text[]`,
    ),
    check(
      "product_events_language_check",
      sql`${t.language} IN ('en','hi','mixed','unknown')`,
    ),
    check(
      "product_events_outcome_check",
      sql`${t.outcome} IN ('started','complete','failed','interrupted')`,
    ),
    check(
      "product_events_unsupported_target_check",
      sql`${t.unsupportedTarget} IN ('booking','payment','mail','calendar','background','document','location','other')`,
    ),
    check(
      "product_events_error_class_check",
      sql`${t.errorClass} IN ('timeout','response_failed','interrupted')`,
    ),
  ],
);

export const telegramLinks = pgTable("telegram_links", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: time("expires_at")
    .notNull()
    .default(sql`now()+interval '10 minutes'`),
});
export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    botId: text("bot_id").notNull(),
    updateId: bigint("update_id", { mode: "number" }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id").notNull(),
    replyId: bigint("reply_id", { mode: "number" }),
    state: text("state").notNull().default("processing"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.botId, t.updateId] })],
);

export const followups = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    relatedItemId: uuid("related_item_id"),
    reason: text("reason").notNull(),
    triggerType: text("trigger_type").notNull().default("explicit_request"),
    scheduledFor: time("scheduled_for").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").notNull().default("scheduled"),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    attempts: integer("attempts").notNull().default(0),
    attemptId: uuid("attempt_id"),
    retryAt: time("retry_at"),
    deliveredAt: time("delivered_at"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    sourceId: uuid("source_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    triggeredAt: time("triggered_at"),
    openedAt: time("opened_at"),
    completedAt: time("completed_at"),
    dismissedAt: time("dismissed_at"),
    cancelledAt: time("cancelled_at"),
    lifecycleSource: text("lifecycle_source").notNull().default("legacy"),
    lifecycleChangedAt: time("lifecycle_changed_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.relatedItemId, t.userId],
      foreignColumns: [savedItems.id, savedItems.userId],
    }), // Migration supplies column-specific SET NULL and deletion trigger.
    index("followup_due")
      .on(t.scheduledFor)
      .where(sql`${t.status}='scheduled'`),
    index("followup_inbox").on(t.userId, t.status, t.scheduledFor),
    check(
      "followup_status",
      sql`${t.status} IN ('scheduled','ready','completed','dismissed','cancelled')`,
    ),
    check(
      "followup_delivery",
      sql`${t.deliveryStatus} IN ('pending','sending','delivered','unknown','failed')`,
    ),
    check("followup_trigger", sql`${t.triggerType}='explicit_request'`),
    check("followup_reason", sql`length(${t.reason}) BETWEEN 1 AND 1000`),
    check("followup_version", sql`${t.version}>0`),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().default("image"),
    title: text("title").notNull(),
    category: text("category").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    original: binary("original").notNull(),
    understanding: binary("understanding").notNull(),
    sourceAttachmentId: uuid("source_attachment_id").notNull(),
    sourceMessageId: uuid("source_message_id").notNull(),
    sourceConversationId: uuid("source_conversation_id").notNull(),
    relatedItemId: uuid("related_item_id"),
    version: integer("version").notNull().default(1),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("artifact_owned_id").on(t.id, t.userId),
    unique("artifact_source").on(t.userId, t.sourceAttachmentId),
    foreignKey({
      columns: [t.relatedItemId, t.userId],
      foreignColumns: [savedItems.id, savedItems.userId],
    }),
    index("artifact_owner").on(t.userId, t.createdAt),
    check("artifact_image", sql`${t.mediaType}='image'`),
  ],
);
export const messageArtifacts = pgTable(
  "message_artifacts",
  {
    userId: text("user_id").notNull(),
    messageId: uuid("message_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.artifactId] }),
    foreignKey({
      columns: [t.messageId, t.userId],
      foreignColumns: [messages.id, messages.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.artifactId, t.userId],
      foreignColumns: [artifacts.id, artifacts.userId],
    }).onDelete("cascade"),
  ],
);
