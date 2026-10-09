import { event } from "../src/events";
import { useState } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient, baseURL } from "../src/auth";
import { Screen, Input, Button, Label } from "../src/ui";
export default function SignIn() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const query = useQueryClient();
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = signup
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
      if (result.error)
        throw new Error(result.error.message ?? "Could not sign in.");
      query.clear();
      if (signup && !result.data?.token)
        setError("Check your email to verify your account, then sign in.");
      else {
        event("mobile_login_completed");
        router.replace("/(tabs)");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={signup ? "Welcome to Sahaay" : "Welcome back"}
      subtitle="One account for Web, Telegram and your phone."
    >
      {signup ? (
        <Input
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
        />
      ) : null}
      <Input
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoComplete={signup ? "new-password" : "current-password"}
      />
      {error ? <Label>{error}</Label> : null}
      <Button
        title={busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        disabled={busy || !email || !password || (signup && !name)}
        onPress={() => void submit()}
      />
      <Button
        title={
          signup ? "Already have an account? Sign in" : "Create an account"
        }
        secondary
        onPress={() => setSignup(!signup)}
      />
      <Button
        title="Reset password"
        secondary
        onPress={() => {
          void authClient
            .requestPasswordReset({
              email,
              redirectTo: baseURL + "/reset-password",
            })
            .then(() =>
              setError(
                "If this account exists, a reset link will arrive by email.",
              ),
            )
            .catch(() => setError("Could not request reset."));
        }}
      />
    </Screen>
  );
}
