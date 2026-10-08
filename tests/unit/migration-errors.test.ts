import { expect, test } from "vitest";
import { migrationFailure } from "../../scripts/migration-errors";

test("identifies missing and malformed CA files without exposing their contents", () => {
  expect(migrationFailure({ code: "ENOENT", message: "private" })).toContain(
    "Render Secret File",
  );
  expect(
    migrationFailure({
      code: "ERR_OSSL_PEM_NO_START_LINE",
      message: "private",
    }),
  ).toContain("real newlines");
  expect(
    migrationFailure({ code: "ERR_OSSL_UNSUPPORTED", message: "private" }),
  ).toContain("ERR_OSSL_UNSUPPORTED");
  expect(
    migrationFailure({ code: "ERR_OSSL_UNSUPPORTED", message: "private" }),
  ).not.toContain("private");
});

test("identifies connection/authentication failures without exposing driver contents", () => {
  const result = migrationFailure({
    code: "28P01",
    message: "password=private",
    detail: "private SQL",
  });
  expect(result).toContain("28P01");
  expect(result).not.toContain("private");
});

test("does not leak arbitrary errors or codes", () => {
  expect(
    migrationFailure(new Error("postgres://user:secret@host/db")),
  ).not.toContain("secret");
  expect(migrationFailure({ code: "secret", detail: "private" })).not.toContain(
    "secret",
  );
});

test("gives actionable network and TLS guidance", () => {
  expect(migrationFailure({ code: "ENETUNREACH" })).toContain("session pooler");
  expect(migrationFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN" })).toContain(
    "do not disable verification",
  );
});

test("identifies uncoded provider and password failures safely", () => {
  expect(migrationFailure(new Error("Tenant or user not found"))).toContain(
    "project-specific username",
  );
  expect(
    migrationFailure(
      new Error(
        "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
      ),
    ),
  ).toContain("password is missing");
});

test("identifies nested connection failures without printing private details", () => {
  expect(
    migrationFailure(
      new AggregateError(
        [{ code: "ENETUNREACH", message: "private" }],
        "private",
      ),
    ),
  ).toContain("ENETUNREACH");
  expect(
    migrationFailure(
      new Error("private", {
        cause: { code: "ECONNREFUSED", message: "private" },
      }),
    ),
  ).not.toContain("private");
});
