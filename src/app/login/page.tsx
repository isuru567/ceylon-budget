"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (data.session) router.push("/dashboard");
      else setMsg("Check your email and click the confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMsg(error.message);
      else router.push("/dashboard");
    }
    setLoading(false);
  }

  const input =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white text-slate-900 rounded-2xl shadow p-6 space-y-4"
      >
        <h1 className="text-xl font-bold">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

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
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg py-2 disabled:opacity-60"
        >
          {loading
            ? "Please wait..."
            : mode === "signin"
            ? "Sign in"
            : "Sign up"}
        </button>

        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-sm text-slate-600 underline"
        >
          {mode === "signin"
            ? "No account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}