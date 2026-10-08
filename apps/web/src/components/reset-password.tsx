"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "../auth/client";
export function ResetPassword({ token }: { token: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      const result = await authClient.resetPassword({
        token,
        newPassword: String(form.get("password")),
      });
      if (result.error)
        setError(
          "This link is invalid or expired. Request another reset link.",
        );
      else setDone(true);
    } catch {
      setError("Couldn’t reset your password. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <h1>Choose a new password.</h1>
        {done ? (
          <p role="status">
            Password changed. Your previous sessions have been signed out.
          </p>
        ) : token ? (
          <form onSubmit={submit}>
            <label>
              New password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? "Saving…" : "Reset password"}
            </button>
          </form>
        ) : (
          <p role="alert">This reset link is invalid or expired.</p>
        )}
        <p>
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
