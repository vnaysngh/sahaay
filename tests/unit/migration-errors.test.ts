import { expect, test } from "vitest";
import { migrationFailure } from "../../scripts/migration-errors";

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
