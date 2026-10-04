import {
  pgTable,
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
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
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
      sql`${t.operation} IN ('remember','update_memory','forget','save','update_item','remove_item')`,
    ),
  ],
);
