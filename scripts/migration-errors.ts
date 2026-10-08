// Never print driver messages: they can contain credentials, SQL or private data.
export function migrationFailure(error: unknown): string {
  const hints: Record<string, string> = {
    EPERM: "The operating system or sandbox denied database network access.",
    EACCES: "The operating system denied access to the database connection or certificate file.",
    ENOTFOUND: "Database hostname could not be resolved. Check DATABASE_URL.",
    ENETUNREACH:
      "Database network is unreachable. For Supabase on IPv4 hosting, use the session pooler (port 5432).",
    ECONNREFUSED:
      "Database refused the connection. Check the host and port; localhost points to Render itself.",
    ETIMEDOUT:
      "Database connection timed out. Check host, port and network access.",
    ECONNRESET:
      "Database connection was reset. Check TLS and database availability.",
    SELF_SIGNED_CERT_IN_CHAIN:
      "TLS certificate chain is not trusted. Configure the database provider's CA certificate; do not disable verification.",
    DEPTH_ZERO_SELF_SIGNED_CERT:
      "Database supplied a self-signed TLS certificate. Configure the correct CA certificate.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      "Database TLS certificate could not be verified. Configure the provider's CA certificate.",
    ERR_TLS_CERT_ALTNAME_INVALID:
      "Database hostname does not match its TLS certificate. Use the provider's correct database hostname.",
    "28P01":
      "Database password authentication failed. Check the database username/password and URL encoding.",
    "28000":
      "Database authentication rejected. Check username, connection endpoint and access rules.",
    "3D000":
      "Configured database does not exist. Check the database name in DATABASE_URL.",
    "42501": "Database role lacks permission to apply migrations.",
    "42P07":
      "A table already exists but this migration is not recorded. Inspect the existing schema before retrying.",
    "42701":
      "A column already exists but this migration is not recorded. Inspect the existing schema before retrying.",
  };
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (Object.hasOwn(hints, code)) return `${code}: ${hints[code]}`;
  if (error instanceof Error) {
    const messages = [
      "DATABASE_URL is required",
      "Applied migration changed",
      "Pending migration",
      "Connection terminated due to connection timeout",
    ];
    if (messages.includes(error.message)) return error.message;
  }
  if (/^[0-9A-Z]{5}$/.test(code))
    return `PostgreSQL error ${code}. Check the migration SQL and database permissions.`;
  return "Unclassified database/migration error. Inspect provider logs; credentials and raw driver details are intentionally omitted.";
}
