"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const IKONLAR = {
  yukle: <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" />,
  kural: <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />,
  // Video için geçici gizli — geri açınca yorumdan çıkar
  // eslesme: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  // uniq: <path d="M4 7h16M4 12h10M4 17h7M16 14l4 4m0-4-4 4" />,
  // mutabakat: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  // karsilastir: <path d="M8 7h11l-3-3m3 3-3 3M16 17H5l3 3m-3-3 3-3" />,
};

const GRUPLAR = [
  {
    baslik: "Çalışma alanı",
    linkler: [
      { href: "/yukle", ad: "Prim Hesaplama", ikon: "yukle", ana: true },
      { href: "/kurallar", ad: "Prim Kuralları", ikon: "kural" },
    ],
  },
  // Video için geçici gizli — "geri aç" deyince yorumdan çıkar
  // {
  //   baslik: "Veri kontrolü",
  //   linkler: [
  //     { href: "/uniq-fark", ad: "Uniq Kod Farkları", ikon: "uniq" },
  //     { href: "/eslesmeyen", ad: "Satış Satırı Sorunları", ikon: "eslesme" },
  //     { href: "/mutabakat", ad: "Satır Kontrolü", ikon: "mutabakat" },
  //     { href: "/karsilastir", ad: "Excel Karşılaştır", ikon: "karsilastir" },
  //   ],
  // },
];

export default function Menu() {
  const yol = usePathname();

  return (
    <nav>
      {GRUPLAR.map((grup) => (
        <div className="menu-grup" key={grup.baslik}>
          <span className="menu-baslik">{grup.baslik}</span>
          {grup.linkler.map((link) => {
            const aktif = yol === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${aktif ? "aktif" : ""} ${link.ana ? "menu-ana" : ""}`}
              >
                <span className="menu-ikon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round">
                    {IKONLAR[link.ikon]}
                  </svg>
                </span>
                <span className="menu-metin">{link.ad}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
