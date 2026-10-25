"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TestPage() {
  const [msg, setMsg] = useState("Seraching...");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bills")
      .select("*")
      .then(({ data, error }) => {
        if (error) setMsg("❌ Error: " + error.message);
        else setMsg("✅ Supabase Connected! Number of Bills: " + data.length);
      });
  }, []);

  
  return <main style={{ padding: 40, fontSize: 20 }}>{msg}</main>;
}