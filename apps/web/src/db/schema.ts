import {
  pgTable,
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
