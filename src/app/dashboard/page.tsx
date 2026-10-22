"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categoryLabel } from "@/lib/categories";

type Expense = { id: string; name: string; amount: number; category: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function nextMonthStart() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`;
}

export default function Dashboard() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [basic, setBasic] = useState("");
  const [other, setOther] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("oth");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    setUserId(u.user.id);

    const [p, inc, exp] = await Promise.all([
      supabase.from("profiles").select("currency").single(),
      supabase
        .from("incomes")
        .select("basic, other")
        .eq("month", monthStart())
        .maybeSingle(),
      supabase
        .from("expenses")
        .select("id, name, amount, category")
        .gte("spent_on", monthStart())
        .lt("spent_on", nextMonthStart())
        .order("created_at", { ascending: false }),
    ]);

    if (p.data) setCurrency(p.data.currency);
    if (inc.data) {
      setBasic(String(inc.data.basic));
      setOther(String(inc.data.other));
    }
    setExpenses(
      (exp.data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }))
    );
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveIncome() {
    setMsg("");
    const { error } = await supabase.from("incomes").upsert(
      {
        user_id: userId,
        month: monthStart(),
        basic: Number(basic) || 0,
        other: Number(other) || 0,
      },
      { onConflict: "user_id,month" }
    );
    setMsg(error ? "Error: " + error.message : "Income saved");
  }

  async function addExpense() {
    const value = Number(amount);
    if (!name.trim() || !(value > 0)) return;
    const { error } = await supabase
      .from("expenses")
      .insert({ name: name.trim(), amount: value, category });
    if (error) {
      setMsg("Error: " + error.message);
      return;
    }
    setName("");
    setAmount("");
    load();
  }

  async function removeExpense(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    load();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function money(n: number) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${currency} ${Math.round(n)}`;
    }
  }

  const income = (Number(basic) || 0) + (Number(other) || 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const savings = income - totalExpenses;

  const input =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900";

  if (loading) return <main className="p-10">Loading...</main>;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Monthly Budget</h1>
          <button onClick={logout} className="border rounded-lg px-3 py-1 bg-white">
            Sign out
          </button>
        </div>

        <section className="bg-white rounded-2xl p-4 shadow space-y-3">
          <h2 className="font-semibold text-green-700">Monthly income</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              className={input}
              type="number"
              placeholder="Basic salary"
              value={basic}
              onChange={(e) => setBasic(e.target.value)}
            />
            <input
              className={input}
              type="number"
              placeholder="Overtime / other"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          </div>
          <button
            onClick={saveIncome}
            className="bg-amber-500 hover:bg-amber-600 font-semibold rounded-lg px-4 py-2"
          >
            Save income
          </button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>

        <section className="bg-white rounded-2xl p-4 shadow space-y-3">
          <h2 className="font-semibold text-red-700">Expenses (no bill)</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              className={input}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={input}
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <select
            className={input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={addExpense}
            className="bg-amber-500 hover:bg-amber-600 font-semibold rounded-lg px-4 py-2"
          >
            Add expense
          </button>

          {expenses.map((e) => (
            <div
              key={e.id}
              className="flex justify-between items-center border-t pt-2"
            >
              <div>
                {e.name}
                <div className="text-xs text-slate-500">
                  {categoryLabel(e.category)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <b>{money(e.amount)}</b>
                <button
                  onClick={() => removeExpense(e.id)}
                  className="text-red-600 text-lg"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl p-4 shadow space-y-2">
          <h2 className="font-semibold">Summary</h2>
          <div className="flex justify-between">
            <span>Total income</span>
            <b className="text-green-700">{money(income)}</b>
          </div>
          <div className="flex justify-between">
            <span>Total expenses</span>
            <b className="text-red-700">{money(totalExpenses)}</b>
          </div>
          <div className="flex justify-between text-lg border-t pt-2">
            <span>Net savings</span>
            <b className={savings >= 0 ? "text-green-700" : "text-red-700"}>
              {money(savings)}
            </b>
          </div>
        </section>
      </div>
    </main>
  );
}