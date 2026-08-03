"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function hucreMetni(v) {
  if (v == null || v === "") return "(Boş)";
  return String(v);
}

function parseSayi(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/TL\.?/gi, "").replace(/%/g, "").replace(/\s/g, "").trim();
  if (!s || s === "-" || s === "-TL.") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtSayi(n) {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/**
 * Excel tarzı kolon filtresi + sürükleyerek seçimde Topla.
 *
 * serverModu: filtreler sunucuda uygulanır; degerleriGetir / onFiltreUygula zorunlu.
 * acilacakKolon: dışarıdan (Filtrele butonu) panel açmak için.
 */
export default function ExcelFiltreTablo({
  kolonlar,
  satirlar,
  rowKey,
  degerAl,
  yaz,
  satirStil,
  baslikStil,
  className = "",
  serverModu = false,
  filtreler: disFiltreler,
  onFiltreUygula,
  degerleriGetir,
  filtreKolonlari,
  acilacakKolon,
  onAcilacakIsletildi,
  acilacakAra = "",
  toplamKayit,
}) {
  const [yerelFiltre, setYerelFiltre] = useState({});
  const filtreler = serverModu ? (disFiltreler || {}) : yerelFiltre;
  const [acikFiltre, setAcikFiltre] = useState(null);
  const [filtreAra, setFiltreAra] = useState("");
  const [taslak, setTaslak] = useState(null);
  const [tumDegerler, setTumDegerler] = useState([]);
  const [degerYukleniyor, setDegerYukleniyor] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [secim, setSecim] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [kopyaMesaj, setKopyaMesaj] = useState(null);
  const surukleniyor = useRef(false);
  const suruklediMi = useRef(false);
  const panelRef = useRef(null);
  const kopyaTimer = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!serverModu) {
      setYerelFiltre({});
    }
    setAcikFiltre(null);
    setSecim(null);
  }, [satirlar, serverModu]);

  // Filtrele butonu vb. dışarıdan kolon paneli aç
  useEffect(() => {
    if (!acilacakKolon) return;
    const kol = kolonlar.find((k) => k.key === acilacakKolon);
    if (!kol) {
      onAcilacakIsletildi?.();
      return;
    }
    // Ekranın ortasına yakın aç
    setPanelPos({
      top: Math.max(80, Math.min(window.innerHeight / 4, window.innerHeight - 420)),
      left: Math.max(16, Math.min(window.innerWidth / 2 - 140, window.innerWidth - 280)),
    });
    void panelAc(acilacakKolon, null, acilacakAra || "");
    onAcilacakIsletildi?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acilacakKolon]);

  useEffect(() => {
    if (!acikFiltre) return;
    function disari(e) {
      if (e.target.closest?.(".excel-filtre-btn")) return;
      if (e.target.closest?.(".prim-calisma-filtre")) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setAcikFiltre(null);
        setTaslak(null);
      }
    }
    document.addEventListener("mousedown", disari);
    return () => document.removeEventListener("mousedown", disari);
  }, [acikFiltre]);

  const filtreAktif = (key) => Array.isArray(filtreler[key]) && filtreler[key].length > 0;

  const filtrelenmis = useMemo(() => {
    if (serverModu) return satirlar;
    const gercek = Object.entries(filtreler).filter(([, arr]) => Array.isArray(arr));
    if (!gercek.length) return satirlar;
    return satirlar.filter((s) =>
      gercek.every(([key, arr]) => arr.includes(hucreMetni(degerAl(s, key))))
    );
  }, [satirlar, filtreler, degerAl, serverModu]);

  function secimMetni() {
    if (!secim) return "";
    const rMin = Math.min(secim.r0, secim.r1);
    const rMax = Math.max(secim.r0, secim.r1);
    const cMin = Math.min(secim.c0, secim.c1);
    const cMax = Math.max(secim.c0, secim.c1);
    const satirlarMetin = [];
    for (let r = rMin; r <= rMax; r++) {
      const satir = filtrelenmis[r];
      if (!satir) continue;
      const hucreler = [];
      for (let c = cMin; c <= cMax; c++) {
        const kol = kolonlar[c];
        if (!kol) continue;
        hucreler.push(String(yaz(satir, kol) ?? ""));
      }
      satirlarMetin.push(hucreler.join("\t"));
    }
    return satirlarMetin.join("\n");
  }

  async function kopyala(metin) {
    const t = String(metin ?? "").trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setKopyaMesaj(t.length > 42 ? `${t.slice(0, 42)}…` : t);
    if (kopyaTimer.current) clearTimeout(kopyaTimer.current);
    kopyaTimer.current = setTimeout(() => setKopyaMesaj(null), 1600);
  }

  useEffect(() => {
    function bitir() {
      surukleniyor.current = false;
    }
    function esc(e) {
      if (e.key === "Escape") setSecim(null);
    }
    async function kopyaKisayol(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "c") return;
      if (!secim) return;
      const metin = secimMetni();
      if (!metin) return;
      e.preventDefault();
      await kopyala(metin);
    }
    window.addEventListener("mouseup", bitir);
    window.addEventListener("keydown", esc);
    window.addEventListener("keydown", kopyaKisayol);
    return () => {
      window.removeEventListener("mouseup", bitir);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("keydown", kopyaKisayol);
      if (kopyaTimer.current) clearTimeout(kopyaTimer.current);
    };
  });

  const secimOzet = useMemo(() => {
    if (!secim || !kolonlar.length || !filtrelenmis.length) return null;
    const rMin = Math.min(secim.r0, secim.r1);
    const rMax = Math.max(secim.r0, secim.r1);
    const cMin = Math.min(secim.c0, secim.c1);
    const cMax = Math.max(secim.c0, secim.c1);
    let toplam = 0;
    let adet = 0;
    const kolonAdlari = new Set();
    for (let r = rMin; r <= rMax; r++) {
      const satir = filtrelenmis[r];
      if (!satir) continue;
      for (let c = cMin; c <= cMax; c++) {
        const kol = kolonlar[c];
        if (!kol) continue;
        const n = parseSayi(degerAl(satir, kol.key));
        if (n != null) {
          toplam += n;
          adet += 1;
          kolonAdlari.add(String(kol.ad || kol.key).replace(/\n/g, " "));
        }
      }
    }
    if (adet === 0) return null;
    return {
      toplam,
      adet,
      ortalama: toplam / adet,
      kolon: [...kolonAdlari].join(", "),
    };
  }, [secim, filtrelenmis, kolonlar, degerAl]);

  function kolonFiltrelenebilir(key) {
    if (!serverModu) return true;
    if (!filtreKolonlari) return true;
    return filtreKolonlari.includes(key);
  }

  function kolonTopla(ci, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!filtrelenmis.length) return;
    setSecim({ r0: 0, c0: ci, r1: filtrelenmis.length - 1, c1: ci });
  }

  async function panelAc(key, e, araBaslangic = "") {
    if (e) {
      e.stopPropagation();
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      const panelW = 280;
      setPanelPos({
        top: Math.min(rect.bottom + 4, window.innerHeight - 420),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - panelW - 8),
      });
    }
    if (acikFiltre === key && e) {
      setAcikFiltre(null);
      setTaslak(null);
      return;
    }
    if (!kolonFiltrelenebilir(key)) return;

    setFiltreAra(araBaslangic || "");
    setAcikFiltre(key);
    setDegerYukleniyor(true);
    setTumDegerler([]);

    let hepsi = [];
    if (serverModu && degerleriGetir) {
      try {
        hepsi = await degerleriGetir(key);
      } catch {
        hepsi = [];
      }
    } else {
      const set = new Set();
      for (const s of satirlar) set.add(hucreMetni(degerAl(s, key)));
      hepsi = [...set].sort((a, b) =>
        a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" })
      );
    }
    setTumDegerler(hepsi);
    const mevcut = filtreler[key];
    setTaslak(Array.isArray(mevcut) && mevcut.length ? new Set(mevcut) : new Set(hepsi));
    setDegerYukleniyor(false);
  }

  function filtreUygula() {
    if (!acikFiltre || !taslak) return;
    const secilen = [...taslak];
    const sonraki = { ...filtreler };
    if (secilen.length === 0) {
      sonraki[acikFiltre] = []; // hiçbir şey → 0 satır
    } else if (secilen.length === tumDegerler.length) {
      delete sonraki[acikFiltre];
    } else {
      sonraki[acikFiltre] = secilen;
    }
    if (serverModu) {
      onFiltreUygula?.(sonraki);
    } else {
      setYerelFiltre(sonraki);
    }
    setAcikFiltre(null);
    setTaslak(null);
    setSecim(null);
  }

  function tumFiltreleriTemizle() {
    if (serverModu) onFiltreUygula?.({});
    else setYerelFiltre({});
    setAcikFiltre(null);
    setTaslak(null);
  }

  function secBasla(r, c, e) {
    if (e.button !== 0) return;
    if (e.target.closest?.(".excel-filtre-btn")) return;
    if (e.target.closest?.(".excel-topla-btn")) return;
    if (e.shiftKey && secim) {
      setSecim((prev) => ({ ...prev, r1: r, c1: c }));
      return;
    }
    surukleniyor.current = true;
    suruklediMi.current = false;
    setSecim({ r0: r, c0: c, r1: r, c1: c });
  }

  function secSurukle(r, c) {
    if (!surukleniyor.current) return;
    suruklediMi.current = true;
    setSecim((prev) => (prev ? { ...prev, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c }));
  }

  function hucreBirak(raw) {
    if (!suruklediMi.current && raw != null && String(raw) !== "") {
      void kopyala(raw);
    }
    surukleniyor.current = false;
  }

  function hucreSecili(r, c) {
    if (!secim) return false;
    const rMin = Math.min(secim.r0, secim.r1);
    const rMax = Math.max(secim.r0, secim.r1);
    const cMin = Math.min(secim.c0, secim.c1);
    const cMax = Math.max(secim.c0, secim.c1);
    return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
  }

  const aktifFiltreSayisi = Object.keys(filtreler).filter((k) => filtreAktif(k)).length;
  const acikKolon = acikFiltre ? kolonlar.find((k) => k.key === acikFiltre) : null;
  const gorunenDegerler = tumDegerler.filter((v) => {
    if (!filtreAra.trim()) return true;
    return v.toLocaleLowerCase("tr-TR").includes(filtreAra.trim().toLocaleLowerCase("tr-TR"));
  });

  const filtrePaneli =
    mounted && acikFiltre && taslak && acikKolon
      ? createPortal(
          <div
            className="excel-filtre-panel"
            ref={panelRef}
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 1000 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="excel-filtre-baslik">
              {acikKolon.ad}
              {serverModu ? " · tüm dönem" : ""}
            </div>
            <input
              className="excel-filtre-ara"
              value={filtreAra}
              onChange={(e) => setFiltreAra(e.target.value)}
              placeholder="Değer ara…"
              autoFocus
            />
            <div className="excel-filtre-aksyon">
              <button type="button" onClick={() => setTaslak(new Set(tumDegerler))}>
                Tümünü seç
              </button>
              <button type="button" onClick={() => setTaslak(new Set())}>
                Temizle
              </button>
            </div>
            <div className="excel-filtre-liste">
              {degerYukleniyor && <div className="excel-filtre-bos">Değerler yükleniyor…</div>}
              {!degerYukleniyor &&
                gorunenDegerler.map((v) => (
                  <label key={v} className="excel-filtre-satir">
                    <input
                      type="checkbox"
                      checked={taslak.has(v)}
                      onChange={() => {
                        const n = new Set(taslak);
                        if (n.has(v)) n.delete(v);
                        else n.add(v);
                        setTaslak(n);
                      }}
                    />
                    <span title={v}>{v}</span>
                  </label>
                ))}
              {!degerYukleniyor && !gorunenDegerler.length && (
                <div className="excel-filtre-bos">Eşleşen değer yok</div>
              )}
            </div>
            <div className="excel-filtre-footer">
              <button
                type="button"
                className="btn ikincil"
                onClick={() => {
                  setAcikFiltre(null);
                  setTaslak(null);
                }}
              >
                İptal
              </button>
              <button type="button" className="btn" onClick={filtreUygula} disabled={degerYukleniyor}>
                Tamam
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`excel-filtre-kapsul ${className}`}>
      {aktifFiltreSayisi > 0 && (
        <div className="excel-filtre-ozet">
          <span>
            {aktifFiltreSayisi} kolon filtresi
            {toplamKayit != null
              ? ` · ${Number(toplamKayit).toLocaleString("tr-TR")} kayıt (tüm dönem)`
              : ` · ${filtrelenmis.length.toLocaleString("tr-TR")} / ${satirlar.length.toLocaleString("tr-TR")} satır`}
          </span>
          <button type="button" className="btn ikincil" onClick={tumFiltreleriTemizle}>
            Kolon filtrelerini temizle
          </button>
        </div>
      )}

      <div className="excel-tablo-wrap prim-calisma-wrap">
        <table className="excel-tablo prim-calisma-tablo excel-secilebilir">
          <thead>
            <tr>
              {kolonlar.map((k, ci) => {
                const aktifMi = filtreAktif(k.key);
                const izinli = kolonFiltrelenebilir(k.key);
                return (
                  <th
                    key={k.key}
                    style={{
                      ...(baslikStil ? baslikStil(k) : {}),
                      position: "relative",
                      userSelect: "none",
                    }}
                  >
                    <div className="excel-th-ic">
                      <span>{k.ad}</span>
                      {k.sayisal && (
                        <button
                          type="button"
                          className="excel-topla-btn"
                          title="Bu kolonun tümünü seç ve topla"
                          onClick={(e) => kolonTopla(ci, e)}
                          aria-label={`${k.ad} topla`}
                        >
                          Σ
                        </button>
                      )}
                      {izinli && (
                        <button
                          type="button"
                          className={`excel-filtre-btn${aktifMi ? " aktif" : ""}`}
                          title="Filtrele (tüm veri)"
                          onClick={(e) => panelAc(k.key, e)}
                          aria-label={`${k.ad} filtre`}
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
                            <path fill="currentColor" d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtrelenmis.map((s, ri) => (
              <tr key={rowKey(s, ri)} style={satirStil ? satirStil(s) : undefined}>
                {kolonlar.map((k, ci) => {
                  const raw = yaz(s, k);
                  const secili = hucreSecili(ri, ci);
                  return (
                    <td
                      key={k.key}
                      className={secili ? "excel-hucre-secili" : undefined}
                      style={{
                        border: "1px solid #ccc",
                        padding: "3px 5px",
                        textAlign: k.sayisal ? "right" : "left",
                        whiteSpace: "nowrap",
                        color: "#000",
                        fontSize: 11,
                        fontFamily: "Calibri, Arial, sans-serif",
                        cursor: "cell",
                      }}
                      title={raw ? `${raw} — tıkla: kopyala` : ""}
                      onMouseDown={(e) => secBasla(ri, ci, e)}
                      onMouseEnter={() => secSurukle(ri, ci)}
                      onMouseUp={() => hucreBirak(raw)}
                      onDoubleClick={() => { if (raw) void kopyala(raw); }}
                    >
                      {raw}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtrePaneli}

      {mounted && kopyaMesaj && createPortal(
        <div className="excel-kopya-toast" role="status">
          Kopyalandı: <strong>{kopyaMesaj}</strong>
        </div>,
        document.body
      )}

      {mounted &&
        secimOzet &&
        secimOzet.adet > 0 &&
        createPortal(
          <div className="excel-secim-cubuk excel-secim-cubuk-sabit" role="status">
            <span className="excel-secim-pill">
              Topla: <strong>{fmtSayi(secimOzet.toplam)}</strong>
            </span>
            <span className="excel-secim-pill soft">
              Adet: {secimOzet.adet.toLocaleString("tr-TR")}
            </span>
            <span className="excel-secim-pill soft">
              Ort: {fmtSayi(secimOzet.ortalama)}
            </span>
            {secimOzet.kolon && (
              <span className="excel-secim-pill soft">{secimOzet.kolon}</span>
            )}
            <span className="excel-secim-ipucu">
              Sürükle veya Σ ile kolon topla · Esc kapat
            </span>
            <button
              type="button"
              className="excel-secim-kapat"
              onClick={() => setSecim(null)}
              aria-label="Seçimi kapat"
            >
              ×
            </button>
          </div>,
          document.body
        )}

      {!filtrelenmis.length && satirlar.length > 0 && !serverModu && (
        <div className="rapor-bos" style={{ marginTop: 12 }}>
          <h3>Filtrelere uyan satır yok</h3>
          <p>Kolon filtrelerini temizleyip tekrar deneyin.</p>
        </div>
      )}
    </div>
  );
}
