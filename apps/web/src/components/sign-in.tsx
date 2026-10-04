"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { authClient } from "../auth/client";
export function SignIn() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
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
      const result = register
        ? await authClient.signUp.email({
            ...fields,
            name: String(form.get("name")),
          })
        : await authClient.signIn.email(fields);
      if (result.error)
        setError(result.error.message ?? "Couldn’t sign in. Please try again.");
      else {
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
      <Link className="brand auth-brand" href="/sign-in">
        <span className="brand-mark">
          <Sparkles size={19} />
        </span>
        Sahaay<span className="beta">early access</span>
      </Link>
      <section className="auth-card">
        <span className="eyebrow">A LITTLE HELP, EVERY DAY</span>
        <h1>{register ? "Make yourself at home." : "Welcome back."}</h1>
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy ? "One moment…" : register ? "Create account" : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to Sahaay?"}{" "}
          <button
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
            disabled={busy}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        <p className="privacy-note">
          Local development preview · Email verification and recovery are not
          enabled yet.
        </p>
      </section>
      <p className="auth-footer">
        Made for the little things that make up your day.
      </p>
    </main>
  );
}
