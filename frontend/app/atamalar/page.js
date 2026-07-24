"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

export default function Atamalar() {
  const [donem, setDonem] = useState(null);
  const [atamalar, setAtamalar] = useState([]);
  const [bolumler, setBolumler] = useState([]);

  useEffect(() => {
    fetch("/api/bolumler").then((r) => r.json()).then(setBolumler);
  }, []);

  const yenile = () => fetch(`/api/atamalar/${donem}`).then((r) => r.json()).then(setAtamalar);
  useEffect(() => {
    if (!donem) return;
    yenile();
  }, [donem]);

  async function sil(id) {
    if (!confirm("Bu atamayı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/atamalar/${id}`, { method: "DELETE" });
    yenile();
  }

  async function bolumDegistir(id, bolum_id) {
    await fetch(`/api/atamalar/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bolum_id: Number(bolum_id) }),
    });
    yenile();
  }

  return (
    <div>
      <h2>Uzman Atamaları</h2>
      <p className="aciklama">
        Liste <b>Uzman-Mağaza-Grup</b> Excel’inden gelir (Veri Yükleme). Buradan sadece prim senaryosunu
        düzeltebilir veya yanlış satırı silebilirsiniz — yeni uzman/mağaza eklemek için Excel’i yeniden yükleyin.
      </p>
      <DonemSec value={donem} onChange={setDonem} />
      <table>
        <thead>
          <tr>
            <th>Uzman</th><th>Mağaza</th><th>Bayi</th><th>Kaynak Grup</th><th>Prim Senaryosu (Bölüm)</th><th></th>
          </tr>
        </thead>
        <tbody>
          {atamalar.map((a) => (
            <tr key={a.id}>
              <td>{a.ad_soyad}</td>
              <td>{a.prim_magaza}</td>
              <td>{a.bayi}</td>
              <td>{a.grup_adi}</td>
              <td>
                <select
                  value={bolumler.find((b) => b.bolum_adi === a.bolum_adi && (b.marka_grubu_adi || null) === (a.marka_grubu_adi || null))?.id || ""}
                  onChange={(e) => bolumDegistir(a.id, e.target.value)}
                >
                  {bolumler.map((b) => (
                    <option key={b.id} value={b.id}>
                      [{b.kanal}] {b.bolum_adi}{b.marka_grubu_adi ? ` — ${b.marka_grubu_adi}` : ""}
                    </option>
                  ))}
                </select>
              </td>
              <td><button className="btn ikincil" onClick={() => sil(a.id)}>Sil</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {donem && atamalar.length === 0 && (
        <div className="mesaj hata">
          Bu dönem için atama yok.{" "}
          <Link href="/yukle" style={{ textDecoration: "underline", fontWeight: 600 }}>
            Veri Yükleme → Uzman-Mağaza-Grup dosyasını yükle
          </Link>
        </div>
      )}
    </div>
  );
}
