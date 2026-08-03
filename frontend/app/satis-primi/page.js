"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Eski satış primi URL'si artık tek prim raporuna yönlendirilir. */
export default function SatisPrimiRedirect() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const donem = params.get("donem");
    router.replace(donem ? `/rapor?donem=${donem}` : "/rapor");
  }, [router]);

  return (
    <div className="rapor-sayfa">
      <p>Prim raporuna yönlendiriliyor…</p>
    </div>
  );
}
