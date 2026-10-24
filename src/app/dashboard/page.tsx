"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { allCurrencies } from "@/lib/currencies";
import { shrinkImage } from "@/lib/image";

type Item = {
  id: string;
  kind: "bill" | "manual";
  name: string;
  amount: number;
  category: string;
  created_at: string;
  photo_path?: string | null;
};

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

const card = "bg-card border border-border rounded-2xl p-4 shadow-sm";
const input =
  "w-full border border-border rounded-lg px-3 py-2 bg-input text-fg placeholder:text-muted";
const primary =
  "bg-brand text-brand-fg font-semibold rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60";
const tab = (on: boolean) =>
  `rounded-lg px-3 py-2 border border-border ${
    on ? "bg-brand text-brand-fg font-semibold" : "bg-input text-fg"
  }`;

function Line({
  label,
  value,
  approx,
  tone,
  big,
}: {
  label: string;
  value: string;
  approx: string | null;
  tone?: string;
  big?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-start ${
        big ? "text-lg border-t border-border pt-2" : ""
      }`}
    >
      <span>{label}</span>
      <span className="text-right">
        <b className={tone}>{value}</b>
        {approx && <span className="block text-xs text-muted">{approx}</span>}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const currencies = useMemo(() => allCurrencies(), []);

  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [basic, setBasic] = useState("");
  const [other, setOther] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // add form
  const [mode, setMode] = useState<"bill" | "manual">("bill");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("oth");
  const [dueDay, setDueDay] = useState("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    setUserId(u.user.id);

    const [p, inc, exp, bills] = await Promise.all([
      supabase.from("profiles").select("currency").single(),
      supabase
        .from("incomes")
        .select("basic, other")
        .eq("month", monthStart())
        .maybeSingle(),
      supabase
        .from("expenses")
        .select("id, name, amount, category, created_at")
        .gte("spent_on", monthStart())
        .lt("spent_on", nextMonthStart()),
      supabase
        .from("bills")
        .select("id, name, amount, category, photo_path, created_at")
        .gte("created_at", monthStart())
        .lt("created_at", nextMonthStart()),
    ]);

    if (p.data) setCurrency(p.data.currency);
    if (inc.data) {
      setBasic(String(inc.data.basic));
      setOther(String(inc.data.other));
    }

    const merged: Item[] = [
      ...(bills.data ?? []).map((b) => ({
        ...b,
        kind: "bill" as const,
        amount: Number(b.amount),
      })),
      ...(exp.data ?? []).map((e) => ({
        ...e,
        kind: "manual" as const,
        amount: Number(e.amount),
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setItems(merged);

    const paths = merged
      .filter((i) => i.photo_path)
      .map((i) => i.photo_path as string);
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("bill-photos")
        .createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setPhotoUrls(map);
    }
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.rates) setRates(d.rates);
      })
      .catch(() => {});
  }, []);

  async function changeCurrency(code: string) {
    setCurrency(code);
    const { error } = await supabase
      .from("profiles")
      .update({ currency: code })
      .eq("id", userId);
    if (error) setMsg("Error: " + error.message);
  }

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

  function clearPhoto() {
    setPhotoBlob(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoMsg("");
    setFileKey((k) => k + 1);
  }

  function resetForm() {
    setName("");
    setAmount("");
    setCategory("oth");
    setDueDay("");
    clearPhoto();
  }

  function switchMode(m: "bill" | "manual") {
    setMode(m);
    clearPhoto();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoMsg("");
    try {
      const blob = await shrinkImage(file);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoBlob(blob);
      setPhotoPreview(URL.createObjectURL(blob));
    } catch {
      setPhotoMsg("Could not open this image. Please try a JPG or PNG photo.");
    }
  }

  async function submit() {
    const value = Number(amount);
    if (!name.trim() || !(value > 0)) {
      setMsg("Please enter a name and an amount.");
      return;
    }
    setSaving(true);
    setMsg("");

    if (mode === "manual") {
      const { error } = await supabase
        .from("expenses")
        .insert({ name: name.trim(), amount: value, category });
      if (error) setMsg("Error: " + error.message);
      else {
        resetForm();
        load();
      }
      setSaving(false);
      return;
    }

    let photo_path: string | null = null;
    if (photoBlob) {
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("bill-photos")
        .upload(path, photoBlob, { contentType: "image/jpeg" });
      if (upErr) {
        setMsg("Error: " + upErr.message);
        setSaving(false);
        return;
      }
      photo_path = path;
    }
    const { error } = await supabase.from("bills").insert({
      name: name.trim(),
      amount: value,
      category,
      due_day: dueDay ? Number(dueDay) : null,
      photo_path,
    });
    if (error) {
      if (photo_path) await supabase.storage.from("bill-photos").remove([photo_path]);
      setMsg("Error: " + error.message);
    } else {
      resetForm();
      load();
    }
    setSaving(false);
  }

  async function removeItem(item: Item) {
    if (item.kind === "bill") {
      await supabase.from("bills").delete().eq("id", item.id);
      if (item.photo_path) {
        await supabase.storage.from("bill-photos").remove([item.photo_path]);
      }
    } else {
      await supabase.from("expenses").delete().eq("id", item.id);
    }
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

  // LKR conversion (approximate)
  const lkrPerUnit =
    rates && rates.LKR && rates[currency] ? rates.LKR / rates[currency] : null;
  function lkr(n: number) {
    if (currency === "LKR" || !lkrPerUnit) return null;
    return (
      "≈ " +
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: "LKR",
        maximumFractionDigits: 0,
      }).format(n * lkrPerUnit)
    );
  }

  const income = (Number(basic) || 0) + (Number(other) || 0);
  const billsTotal = items
    .filter((i) => i.kind === "bill")
    .reduce((s, i) => s + i.amount, 0);
  const manualTotal = items
    .filter((i) => i.kind === "manual")
    .reduce((s, i) => s + i.amount, 0);
  const totalExpenses = billsTotal + manualTotal;
  const savings = income - totalExpenses;

  if (loading) return <main className="p-10 bg-bg text-fg">Loading...</main>;

  return (
    <main className="min-h-screen bg-bg text-fg p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <h1 className="text-xl font-bold">
            <span className="text-brand">Ceylon</span> Budget
          </h1>
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className="border border-border rounded-lg px-2 py-1 bg-card text-fg max-w-40"
              aria-label="Currency"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={logout}
              className="border border-border rounded-lg px-3 py-1 bg-card"
            >
              Sign out
            </button>
          </div>
        </div>

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-good">Monthly income</h2>
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
          <button onClick={saveIncome} className={primary}>
            Save income
          </button>
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Add an expense</h2>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => switchMode("bill")} className={tab(mode === "bill")}>
              Bill
            </button>
            <button type="button" onClick={() => switchMode("manual")} className={tab(mode === "manual")}>
              Other expense
            </button>
          </div>

          {mode === "bill" && (
            <div className="space-y-2">
              <label className="text-sm text-muted">
                Bill photo (optional). It is saved with the bill so you can look at it later.
              </label>
              <input
                key={fileKey}
                type="file"
                accept="image/*"
                onChange={onPhoto}
                className={`${input} text-sm`}
              />
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Selected bill"
                  className="max-h-48 rounded-lg"
                />
              )}
              {photoMsg && <p className="text-sm text-bad">{photoMsg}</p>}
            </div>
          )}

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
          <div className={mode === "bill" ? "grid grid-cols-2 gap-3" : ""}>
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
            {mode === "bill" && (
              <input
                className={input}
                type="number"
                min={1}
                max={31}
                placeholder="Due day (optional)"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            )}
          </div>
          <button onClick={submit} disabled={saving} className={primary}>
            {saving ? "Saving..." : mode === "bill" ? "Add bill" : "Add expense"}
          </button>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-bad">Expenses this month</h2>
          {items.length === 0 && (
            <p className="text-sm text-muted">Nothing added this month yet.</p>
          )}
          {items.map((it) => {
            const url = it.photo_path ? photoUrls[it.photo_path] : undefined;
            return (
              <div
                key={`${it.kind}-${it.id}`}
                className="flex items-center gap-3 border-t border-border pt-2"
              >
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt="Bill photo"
                      className="w-11 h-11 rounded-lg object-cover"
                    />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{it.name}</div>
                  <div className="text-xs text-muted">
                    {categoryLabel(it.category)} ·{" "}
                    {it.kind === "bill" ? "Bill" : "Manual"}
                  </div>
                </div>
                <b>{money(it.amount)}</b>
                <button
                  onClick={() => removeItem(it)}
                  className="text-bad text-lg"
                  aria-label="Delete"
                >
                  ×
                </button>
              </div>
            );
          })}
        </section>

        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">Summary</h2>
          <Line label="Total income" value={money(income)} approx={lkr(income)} tone="text-good" />
          <Line label="Bills" value={money(billsTotal)} approx={null} />
          <Line label="Other expenses" value={money(manualTotal)} approx={null} />
          <Line label="Total expenses" value={money(totalExpenses)} approx={lkr(totalExpenses)} tone="text-bad" />
          <Line
            big
            label="Net savings"
            value={money(savings)}
            approx={lkr(savings)}
            tone={savings >= 0 ? "text-good" : "text-bad"}
          />
          {currency !== "LKR" && !lkrPerUnit && (
            <p className="text-xs text-muted">LKR rate is not available right now.</p>
          )}
        </section>

        <p className="text-xs text-muted text-center">
          LKR values are approximate and use daily rates.{" "}
          <a
            className="underline"
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noreferrer"
          >
            Rates By Exchange Rate API
          </a>
        </p>
      </div>
    </main>
  );
}