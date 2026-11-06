"use client";

import { useEffect, useRef, useState } from "react";

const ORNEKLER = [
  "Murat Ekinci'ye 10.000 TL ekstra prim verilecek, Semra Hanım onayladı",
  "Sephora Zorlu'da bir uzman ayrıldı, kalan uzman tüm markaları devraldı",
  "Yıllık izinde destek gelmedi, sıralamaya göre değerlendirme istiyorum",
  "Boyner Cepa'da kurumsal satış yüzünden sıralama kaybı oldu, Satış Müdürü tespit etti, 8.000 TL telafi",
];

export default function IstisnaChatbot() {
  const [acik, setAcik] = useState(false);
  const [donemler, setDonemler] = useState([]);
  const [donemId, setDonemId] = useState("");
  const [history, setHistory] = useState([]);
  const [mesaj, setMesaj] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kayitlar, setKayitlar] = useState([]);
  const [openaiHazir, setOpenaiHazir] = useState(null);
  const [hata, setHata] = useState("");
  const sonRef = useRef(null);

  useEffect(() => {
    fetch("/api/donemler")
      .then((r) => r.json())
      .then((rows) => {
        const liste = Array.isArray(rows) ? rows : [];
        setDonemler(liste);
        const hesapli = [...liste].reverse().find((d) => d.durum === "hesaplandi") || liste[liste.length - 1];
        if (hesapli) setDonemId(String(hesapli.id));
      })
      .catch(() => {});
    fetch("/api/istisna-prim/durum")
      .then((r) => r.json())
      .then((j) => setOpenaiHazir(Boolean(j.openai_hazir)))
      .catch(() => setOpenaiHazir(false));
  }, []);

  useEffect(() => {
    if (!donemId) return;
    fetch(`/api/istisna-prim/${donemId}`)
      .then((r) => r.json())
      .then((j) => setKayitlar(j.kayitlar || []))
      .catch(() => setKayitlar([]));
  }, [donemId]);

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, yukleniyor, acik]);

  async function gonder(metin) {
    const text = (metin ?? mesaj).trim();
    if (!text || !donemId || yukleniyor) return;
    setHata("");
    setMesaj("");
    const yeniHistory = [...history, { role: "user", content: text }];
    setHistory(yeniHistory);
    setYukleniyor(true);
    try {
      const r = await fetch(`/api/istisna-prim/${donemId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaj: text, history }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Chat yanıt vermedi");
      setHistory([...yeniHistory, { role: "assistant", content: j.reply || "" }]);
      if (Array.isArray(j.kayitlar)) setKayitlar(j.kayitlar);
    } catch (e) {
      setHata(e.message || "Bağlantı hatası");
      setHistory([
        ...yeniHistory,
        { role: "assistant", content: `Üzgünüm, işlem tamamlanamadı: ${e.message || "hata"}` },
      ]);
    } finally {
      setYukleniyor(false);
    }
  }

  async function sil(id) {
    if (!donemId || !id) return;
    await fetch(`/api/istisna-prim/${donemId}/${id}`, { method: "DELETE" });
    const j = await fetch(`/api/istisna-prim/${donemId}`).then((r) => r.json());
    setKayitlar(j.kayitlar || []);
  }

  function excelIndir(isli) {
    if (!donemId) return;
    const a = document.createElement("a");
    a.href = isli
      ? `/api/istisna-prim/${donemId}/xlsx-uygula`
      : `/api/istisna-prim/${donemId}/xlsx`;
    a.download = isli
      ? `Prim_Hesaplama_Istisna_${donemId}.xlsx`
      : `Istisna_Ek_Prim_${donemId}.xlsx`;
    a.click();
  }

  function sifirla() {
    setHistory([]);
    setHata("");
  }

  return (
    <>
      {!acik && (
        <button
          type="button"
          className="istisna-fab"
          onClick={() => setAcik(true)}
          aria-label="İstisna prim asistanı"
        >
          <span className="istisna-fab-nokta" />
          İstisna
        </button>
      )}

      {acik && (
        <div className="istisna-panel" role="dialog" aria-label="İstisna prim chatbot">
          <header className="istisna-baslik">
            <div>
              <strong>İstisna / ek prim asistanı</strong>
              <small>
                {openaiHazir === false
                  ? "OpenAI anahtarı eksik"
                  : "Kurallar dışı maliyetleri kaydet · Excel’e aktar"}
              </small>
            </div>
            <button type="button" className="istisna-kapat" onClick={() => setAcik(false)}>
              ×
            </button>
          </header>

          <div className="istisna-araclar">
            <label>
              Dönem
              <select value={donemId} onChange={(e) => { setDonemId(e.target.value); sifirla(); }}>
                {donemler.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.ad}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="istisna-link" onClick={() => excelIndir(false)} disabled={!kayitlar.length}>
              Liste Excel ({kayitlar.length})
            </button>
            <button type="button" className="istisna-link" onClick={() => excelIndir(true)} disabled={!kayitlar.length}>
              Prim Excel (işli)
            </button>
            <button type="button" className="istisna-link" onClick={sifirla}>
              Sohbeti temizle
            </button>
          </div>

          <div className="istisna-mesajlar">
            {history.length === 0 && (
              <div className="istisna-hosgeldin">
                <p>
                  Kurallar dışı talepleri yaz: ekstra prim, işten ayrılma, izin,{" "}
                  <b>toplu/kurumsal satış sıralama kaybı</b>. Kolon öneririm, kaydederim;
                  <b> Prim Excel (işli)</b> ile Prim Hesaplama’ya işlenmiş dosyayı indirirsin.
                </p>
                <div className="istisna-ornekler">
                  {ORNEKLER.map((o) => (
                    <button key={o} type="button" onClick={() => gonder(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`istisna-bubble ${m.role === "user" ? "ben" : "bot"}`}>
                {m.content}
              </div>
            ))}
            {yukleniyor && <div className="istisna-bubble bot soluk">Yazıyor…</div>}
            {hata && <div className="istisna-hata">{hata}</div>}
            <div ref={sonRef} />
          </div>

          {kayitlar.length > 0 && (
            <div className="istisna-kayitlar">
              <div className="istisna-kayit-bas">Kayıtlı istisnalar</div>
              {kayitlar.slice(-5).reverse().map((k) => (
                <div key={k.id} className="istisna-kayit">
                  <div>
                    <b>{k.uzman}</b> · {Number(k.tutar).toLocaleString("tr-TR")} TL · kolon {k.kolon}
                    <div className="istisna-kayit-aciklama">{k.aciklama}</div>
                  </div>
                  <button type="button" onClick={() => sil(k.id)} title="Sil">
                    sil
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="istisna-form"
            onSubmit={(e) => {
              e.preventDefault();
              gonder();
            }}
          >
            <input
              value={mesaj}
              onChange={(e) => setMesaj(e.target.value)}
              placeholder="Talebi yaz… (uzman, tutar, onay)"
              disabled={yukleniyor || !donemId}
            />
            <button type="submit" disabled={yukleniyor || !mesaj.trim()}>
              Gönder
            </button>
          </form>
        </div>
      )}
    </>
  );
}
