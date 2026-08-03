"use client";
import { useEffect, useState } from "react";

export default function DonemSec({ value, onChange }) {
  const [donemler, setDonemler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const queryDonem = Number(new URLSearchParams(window.location.search).get("donem") || 0) || null;
        const simdi = new Date();
        const yil = simdi.getFullYear();
        const ay = simdi.getMonth() + 1;
        let liste = await fetch("/api/donemler").then((cevap) => cevap.json());
        if (!Array.isArray(liste)) throw new Error("Dönemler alınamadı");

        let guncel = liste.find(
          (donem) => Number(donem.yil) === yil && Number(donem.ay) === ay
        );
        if (!guncel) {
          const cevap = await fetch("/api/donemler", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ yil, ay }),
          });
          guncel = await cevap.json();
          if (!cevap.ok || guncel.hata) throw new Error(guncel.hata || "Güncel dönem açılamadı");
          liste = await fetch("/api/donemler").then((cevap) => cevap.json());
        }

        setDonemler(liste);
        const queryVar = queryDonem && liste.some((donem) => Number(donem.id) === queryDonem);
        const seciliListede = liste.some((donem) => Number(donem.id) === Number(value));
        if (queryVar) onChange(queryDonem);
        else if (!seciliListede) onChange(guncel?.id || liste[0]?.id);
      } catch (error) {
        setHata(error.message);
      } finally {
        setYukleniyor(false);
      }
    })();
  }, []);

  if (yukleniyor) {
    return (
      <div className="donem-secici donem-yukleniyor">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (hata) return <div className="donem-hata">{hata}</div>;

  return (
    <div className="donem-secici">
      <div className="donem-secici-baslik">
        <span>Dönem</span>
        <small>Çalışmak istediğiniz ayı seçin</small>
      </div>
      <div className="donem-kutular" role="tablist" aria-label="Dönem seçimi">
        {donemler.map((donem) => {
          const aktif = Number(value) === Number(donem.id);
          const buAy =
            Number(donem.yil) === new Date().getFullYear() &&
            Number(donem.ay) === new Date().getMonth() + 1;
          return (
            <button
              key={donem.id}
              type="button"
              role="tab"
              aria-selected={aktif}
              className={aktif ? "aktif" : ""}
              onClick={() => onChange(Number(donem.id))}
            >
              <span>{donem.ad}</span>
              <small>
                <i className={`donem-durum ${donem.durum}`} />
                {buAy
                  ? "Bu ay"
                  : donem.durum === "hesaplandi"
                    ? "Hesaplandı"
                    : donem.durum === "kapandi"
                      ? "Kapalı"
                      : "Açık"}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
