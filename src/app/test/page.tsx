"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TestPage() {
  const [msg, setMsg] = useState("පරීක්ෂා කරමින්...");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bills")
      .select("*")
      .then(({ data, error }) => {
        if (error) setMsg("❌ Error: " + error.message);
        else setMsg("✅ Supabase සම්බන්ධයි! බිල් ගණන: " + data.length);
      });
  }, []);

  return <main style={{ padding: 40, fontSize: 20 }}>{msg}</main>;
}