"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Msg = { text: string; error: boolean } | null;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg({ text: error.message, error: true });
      else if (data.session) router.push("/dashboard");
      else
        setMsg({
          text: "Account created. Check your email and click the confirmation link.",
          error: false,
        });
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMsg({ text: error.message, error: true });
      else router.push("/dashboard");
    }
    setLoading(false);
  }

  const input =
    "w-full border border-border rounded-lg px-3 py-2 bg-input text-fg placeholder:text-muted";

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg text-fg p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4"
      >
        <h1 className="text-xl font-bold">
          <span className="text-brand">Ceylon</span> Budget
        </h1>
        <h2 className="text-muted">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </h2>

        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />

        <button
          disabled={loading}
          className="w-full bg-brand text-brand-fg font-semibold rounded-lg py-2 hover:opacity-90 disabled:opacity-60"
        >
          {loading
            ? "Please wait..."
            : mode === "signin"
            ? "Sign in"
            : "Sign up"}
        </button>

        {msg && (
          <p className={`text-sm ${msg.error ? "text-bad" : "text-good"}`}>
            {msg.text}
          </p>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-sm text-muted underline"
        >
          {mode === "signin"
            ? "No account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}