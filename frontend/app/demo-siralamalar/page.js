"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Eski yol → Yeni Prim Sistem · Sıralamalar */
export default function DemoSiralamalarRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/yeni-prim-sistem");
  }, [router]);
  return (
    <div className="kural-sayfa" style={{ padding: 24, color: "var(--metin-2)" }}>
      Yeni Prim Sistem’e yönlendiriliyor…
    </div>
  );
}
