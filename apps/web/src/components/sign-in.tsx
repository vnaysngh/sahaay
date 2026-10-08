"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { authClient } from "../auth/client";
export function SignIn({
  verification = false,
  recovery = false,
  notice = "",
}: {
  verification?: boolean;
  recovery?: boolean;
  notice?: string;
}) {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [info, setInfo] = useState(notice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const fields = {
        email: String(form.get("email")),
        password: String(form.get("password")),
      };
      if (forgot) {
        if (!recovery) {
          setError(
            "Password recovery is not configured yet. Contact the person running this preview.",
          );
          return;
        }
        const result = await authClient.requestPasswordReset({
          email: fields.email,
          redirectTo: new URL("/reset-password", window.location.origin).href,
        });
        if (result.error)
          setError("Couldn’t request a reset. Please try again later.");
        else
          setInfo(
            "If an account exists for this email, a reset link will arrive shortly.",
          );
        return;
      }
      const result = register
        ? await authClient.signUp.email({
            ...fields,
            name: String(form.get("name")),
            callbackURL: "/sign-in?verified=1",
          })
        : await authClient.signIn.email(fields);
      if (result.error)
        setError(result.error.message ?? "Couldn’t sign in. Please try again.");
      else if (register && verification) {
        setRegister(false);
        setInfo("Check your email for a verification link before signing in.");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow">A LITTLE HELP, EVERY DAY</span>
        <h1>
          {forgot
            ? "Reset your password."
            : register
              ? "Make yourself at home."
              : "Welcome back."}
        </h1>
        <p className="muted">
          A space to ask, understand and think things through.
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          {!forgot && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={12}
                maxLength={128}
                placeholder={
                  register ? "At least 12 characters" : "Your password"
                }
              />
            </label>
          )}
          {info && <p role="status">{info}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy
              ? "One moment…"
              : forgot
                ? "Send reset link"
                : register
                  ? "Create account"
                  : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to Sahaay?"}{" "}
          <button
            onClick={() => {
              if (forgot) setForgot(false);
              else setRegister(!register);
              setInfo("");
              setError("");
            }}
            disabled={busy}
          >
            {forgot || register ? "Sign in" : "Create an account"}
          </button>
        </p>
        {!register && !forgot && (
          <button
            className="text-control"
            onClick={() => {
              setForgot(true);
              setInfo("");
              setError("");
            }}
          >
            Forgot password?
          </button>
        )}
        <p className="privacy-note">
          {verification
            ? "Verify your email before signing in."
            : "Local development preview."}{" "}
          <Link href="/privacy">Privacy and data use</Link>
        </p>
      </section>
      <p className="auth-footer">
        Made for the little things that make up your day.
      </p>
    </main>
  );
}
