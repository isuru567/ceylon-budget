"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  date: string;
  photo_path?: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function monthStart(y: number, m: number) {
  return `${y}-${pad(m)}-01`;
}
function nextMonthStart(y: number, m: number) {
  const n = new Date(y, m, 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`;
}

const card = "bg-card border border-border rounded-2xl p-4 shadow-sm";
const input =
  "w-full border border-border rounded-lg px-3 py-2 bg-input text-fg placeholder:text-muted disabled:opacity-60";
const small =
  "border border-border rounded-lg px-2 py-1 bg-card text-fg";
const primary =
  "bg-brand text-brand-fg font-semibold rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60";
const tab = (on: boolean) =>
  `rounded-lg px-3 py-2 border border-border ${
    on ? "bg-brand text-brand-fg font-semibold" : "bg-input text-fg"
  }`;
const th = "border border-gray-400 px-2 py-1 text-left font-semibold";
const td = "border border-gray-400 px-2 py-1";

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
  const [now] = useState(() => new Date());
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  // selected month (history)
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [firstYear, setFirstYear] = useState(nowYear);
  const [refreshing, setRefreshing] = useState(false);
  const reqId = useRef(0);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
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

  const isCurrent = year === nowYear && month === nowMonth;

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    setUserId(u.user.id);
    setEmail(u.user.email ?? "");
    setFirstYear(new Date(u.user.created_at).getFullYear());
    setRefreshing(true);

    const from = monthStart(year, month);
    const to = nextMonthStart(year, month);

    const [p, inc, exp, bills] = await Promise.all([
      supabase.from("profiles").select("currency").single(),
      supabase
        .from("incomes")
        .select("basic, other")
        .eq("month", from)
        .maybeSingle(),
      supabase
        .from("expenses")
        .select("id, name, amount, category, created_at, spent_on")
        .gte("spent_on", from)
        .lt("spent_on", to),
      supabase
        .from("bills")
        .select("id, name, amount, category, photo_path, created_at")
        .gte("created_at", from)
        .lt("created_at", to),
    ]);
    if (id !== reqId.current) return; // a newer request replaced this one

    if (p.data) setCurrency(p.data.currency);
    setBasic(inc.data ? String(inc.data.basic) : "");
    setOther(inc.data ? String(inc.data.other) : "");

    const merged: Item[] = [
      ...(bills.data ?? []).map((b) => ({
        ...b,
        kind: "bill" as const,
        amount: Number(b.amount),
        date: String(b.created_at).slice(0, 10),
      })),
      ...(exp.data ?? []).map((e) => ({
        ...e,
        kind: "manual" as const,
        amount: Number(e.amount),
        date: String(e.spent_on),
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
      if (id !== reqId.current) return;
      const map: Record<string, string> = {};
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setPhotoUrls(map);
    }
    setRefreshing(false);
    setLoading(false);
  }, [supabase, router, year, month]);

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

  function changeYear(y: number) {
    setYear(y);
    if (y === nowYear && month > nowMonth) setMonth(nowMonth);
  }

  function goCurrent() {
    setYear(nowYear);
    setMonth(nowMonth);
  }

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
        month: monthStart(year, month),
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

  function downloadPdf() {
    const old = document.title;
    document.title = `Ceylon-Budget-${year}-${pad(month)}`;
    const restore = () => {
      document.title = old;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
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

  // LKR conversion (approximate, uses the latest rate)
  const lkrPerUnit =
    rates && rates.LKR && rates[currency] ? rates.LKR / rates[currency] : null;
  const showLkr = currency !== "LKR" && !!lkrPerUnit;
  function lkr(n: number) {
    if (!showLkr || !lkrPerUnit) return null;
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
  const rate = income > 0 ? Math.round((savings / income) * 100) : null;

  const monthName = MONTHS[month - 1];
  const years: number[] = [];
  for (let y = nowYear; y >= Math.min(firstYear, nowYear); y--) years.push(y);

  const byCategory = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    total: items
      .filter((i) => i.category === c.key)
      .reduce((s, i) => s + i.amount, 0),
  }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const reportItems = [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
  );

  const summaryRows: [string, number][] = [
    ["Basic salary", Number(basic) || 0],
    ["Overtime / other income", Number(other) || 0],
    ["Total income", income],
    ["Bills", billsTotal],
    ["Other expenses", manualTotal],
    ["Total expenses", totalExpenses],
    ["Net savings", savings],
  ];

  if (loading) return <main className="p-10 bg-bg text-fg">Loading...</main>;

  return (
    <main className="min-h-screen bg-bg text-fg p-4">
      {/* ---------- Screen view ---------- */}
      <div className="max-w-3xl mx-auto space-y-4 print:hidden">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <h1 className="text-xl font-bold">
            <span className="text-brand">Ceylon</span> Budget
          </h1>
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className={`${small} max-w-40`}
              aria-label="Currency"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
            <button onClick={logout} className={`${small} px-3`}>
              Sign out
            </button>
          </div>
        </div>

                {!isCurrent && (
          <div className={`${card} flex flex-wrap items-center justify-between gap-2`}>
            <p className="text-sm">
              Viewing <b>{monthName} {year}</b>. Past months are read-only.
            </p>
            <button onClick={goCurrent} className={`${small} px-3`}>
              Back to current month
            </button>
          </div>
        )}

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-good">Monthly income</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              className={input}
              type="number"
              placeholder="Basic salary"
              value={basic}
              disabled={!isCurrent}
              onChange={(e) => setBasic(e.target.value)}
            />
            <input
              className={input}
              type="number"
              placeholder="Overtime / other"
              value={other}
              disabled={!isCurrent}
              onChange={(e) => setOther(e.target.value)}
            />
          </div>
          {isCurrent && (
            <button onClick={saveIncome} className={primary}>
              Save income
            </button>
          )}
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </section>

        {isCurrent && (
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
            {Number(amount) > 0 && lkr(Number(amount)) && (
              <p className="text-xs text-muted">{lkr(Number(amount))}</p>
            )}
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
        )}

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-bad">
            Expenses - {monthName} {year}
          </h2>
          {items.length === 0 && (
            <p className="text-sm text-muted">Nothing recorded for this month.</p>
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
                    {it.kind === "bill" ? "Bill" : "Manual"} · {it.date}
                  </div>
                </div>
                <div className="text-right">
                  <b>{money(it.amount)}</b>
                  {lkr(it.amount) && (
                    <div className="text-xs text-muted">{lkr(it.amount)}</div>
                  )}
                </div>
                {isCurrent && (
                  <button
                    onClick={() => removeItem(it)}
                    className="text-bad text-lg"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">Summary</h2>
          <Line label="Total income" value={money(income)} approx={lkr(income)} tone="text-good" />
          <Line label="Bills" value={money(billsTotal)} approx={lkr(billsTotal)} />
          <Line label="Other expenses" value={money(manualTotal)} approx={lkr(manualTotal)} />
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

                <section id="history" className={`${card} space-y-3`}>
          <h2 className="font-semibold">History and reports</h2>
          <p className="text-sm text-muted">
            Choose a month to see its details above, or download it as a PDF.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={small}
              aria-label="Month"
            >
              {MONTHS.map((n, i) => (
                <option
                  key={n}
                  value={i + 1}
                  disabled={year === nowYear && i + 1 > nowMonth}
                >
                  {n}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => changeYear(Number(e.target.value))}
              className={small}
              aria-label="Year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {!isCurrent && (
              <button onClick={goCurrent} className={`${small} px-3`}>
                Current month
              </button>
            )}
            {refreshing && <span className="text-xs text-muted">Loading...</span>}
          </div>
          <button onClick={downloadPdf} className={primary}>
            Download PDF ({monthName} {year})
          </button>
          {showLkr && !isCurrent && (
            <p className="text-xs text-muted">
              LKR values use the latest exchange rate, not the rate of that month.
            </p>
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

      {/* ---------- Print / PDF report ---------- */}
      <div className="hidden print:block text-black text-sm">
        <h1 className="text-2xl font-bold">Ceylon Budget</h1>
        <p className="text-lg">
          Monthly report: {monthName} {year}
        </p>
        <p className="mb-4">
          Account: {email} · Currency: {currency} · Generated:{" "}
          {now.toISOString().slice(0, 10)}
        </p>

        <h2 className="font-bold mt-4 mb-1">Summary</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Item</th>
              <th className={`${th} text-right`}>Amount</th>
              {showLkr && <th className={`${th} text-right`}>LKR (approx.)</th>}
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(([label, value]) => (
              <tr key={label} className="break-inside-avoid">
                <td className={td}>{label}</td>
                <td className={`${td} text-right`}>{money(value)}</td>
                {showLkr && (
                  <td className={`${td} text-right`}>{lkr(value)}</td>
                )}
              </tr>
            ))}
            {rate !== null && (
              <tr>
                <td className={td}>Savings rate</td>
                <td className={`${td} text-right`} colSpan={showLkr ? 2 : 1}>
                  {rate}%
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="font-bold mt-6 mb-1">Expenses by category</h2>
        {byCategory.length === 0 ? (
          <p>No expenses recorded.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Category</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.key} className="break-inside-avoid">
                  <td className={td}>{c.label}</td>
                  <td className={`${td} text-right`}>{money(c.total)}</td>
                  <td className={`${td} text-right`}>
                    {Math.round((c.total / totalExpenses) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="font-bold mt-6 mb-1">All expenses</h2>
        {reportItems.length === 0 ? (
          <p>No expenses recorded.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Name</th>
                <th className={th}>Category</th>
                <th className={th}>Type</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {reportItems.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="break-inside-avoid">
                  <td className={td}>{it.date}</td>
                  <td className={td}>{it.name}</td>
                  <td className={td}>{categoryLabel(it.category)}</td>
                  <td className={td}>{it.kind === "bill" ? "Bill" : "Manual"}</td>
                  <td className={`${td} text-right`}>{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-6 text-xs">
          {showLkr &&
            "LKR values are approximate and use the exchange rate on the date this report was created. "}
          Bill photos are not included in this report. Rates By Exchange Rate API
          (exchangerate-api.com).
        </p>
      </div>
    </main>
  );
}