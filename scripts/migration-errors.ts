// Never print driver messages: they can contain credentials, SQL or private data.
export function migrationFailure(error: unknown, depth = 0): string {
  const hints: Record<string, string> = {
    ENOENT:
      "A required file is missing. For sslrootcert, create the Render Secret File and check its exact filename and /etc/secrets/ path.",
    EISDIR:
      "The certificate path points to a directory rather than a file. Check sslrootcert.",
    ERR_OSSL_PEM_NO_START_LINE:
      "Certificate contents are not valid PEM. Paste the complete certificate with real newlines, including BEGIN/END CERTIFICATE.",
    ERR_OSSL_ASN1_TOO_LONG:
      "Certificate contents are malformed. Upload the original downloaded CA certificate without editing its contents.",
    EPERM: "The operating system or sandbox denied database network access.",
    EACCES:
      "The operating system denied access to the database connection or certificate file.",
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
    ERR_INVALID_URL:
      "DATABASE_URL is malformed. Copy the provider's PostgreSQL connection string and URL-encode special characters in the password.",
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
    const knownMessages: Record<string, string> = {
      "Tenant or user not found":
        "Supabase pooler could not identify the account. Copy its exact connection string, including the project-specific username.",
      "The server does not support SSL connections":
        "The selected database endpoint does not support TLS. Check that DATABASE_URL points to the correct hosted PostgreSQL endpoint.",
      "There was an error establishing an SSL connection":
        "TLS negotiation failed. Check the endpoint and the provider's TLS configuration.",
      "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string":
        "Database password is missing or malformed in DATABASE_URL.",
      "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string":
        "Database password is empty in DATABASE_URL.",
      "Connection terminated unexpectedly":
        "The database closed the connection before login completed. Check endpoint, TLS and provider connection logs.",
      "timeout exceeded when trying to connect":
        "Database connection timed out. Check endpoint and network access.",
    };
    if (Object.hasOwn(knownMessages, error.message))
      return knownMessages[error.message];
    const messages = [
      "DATABASE_URL is required",
      "Applied migration changed",
      "Pending migration",
      "Connection terminated due to connection timeout",
      "Database CA certificate is not valid PEM. Paste the complete certificate with real newlines into the Render secret file.",
    ];
    if (messages.includes(error.message)) return error.message;
  }
  if (depth < 3 && typeof error === "object" && error !== null) {
    if ("cause" in error && error.cause)
      return migrationFailure(error.cause, depth + 1);
    if ("errors" in error && Array.isArray(error.errors) && error.errors.length)
      return [
        ...new Set(
          error.errors
            .slice(0, 4)
            .map((nested) => migrationFailure(nested, depth + 1)),
        ),
      ].join("; ");
  }
  if (/^[0-9A-Z]{5}$/.test(code))
    return `PostgreSQL error ${code}. Check the migration SQL and database permissions.`;
  if (/^(?:ERR_|E)[A-Z0-9_]{1,60}$/.test(code))
    return `Connection/file error ${code}. Credentials and raw error contents are omitted.`;
  return "Unclassified database/migration error. Inspect provider logs; credentials and raw driver details are intentionally omitted.";
}
