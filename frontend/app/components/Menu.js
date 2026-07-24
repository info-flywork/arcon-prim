"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  ozet: <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z" />,
  yukle: <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" />,
  tanim: <path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  atama: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  kural: <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />,
  eslesme: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  uniq: <path d="M4 7h16M4 12h10M4 17h7M16 14l4 4m0-4-4 4" />,
  mutabakat: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  rapor: <path d="M18 20V10M12 20V4M6 20v-6" />,
  gecmis: <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
};

const linkler = [
  ["/", "Özet", "ozet"],
  ["/yukle", "Veri Yükleme", "yukle"],
  ["/tanimlar", "Tanımlar", "tanim"],
  ["/atamalar", "Uzman Atamaları", "atama"],
  ["/kurallar", "Prim Kuralları", "kural"],
  ["/uniq-fark", "Uniq Kod Farkları", "uniq"],
  ["/eslesmeyen", "Satış Satırı Sorunları", "eslesme"],
  ["/mutabakat", "Satır Kontrol (Maviler)", "mutabakat"],
  ["/rapor", "Prim Raporu", "rapor"],
  //["/gecmis", "Değişiklik Geçmişi", "gecmis"],
];

export default function Menu() {
  const yol = usePathname();
  return (
    <nav>
      {linkler.map(([href, ad, ikon]) => (
        <Link key={href} href={href} className={yol === href ? "aktif" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round">{I[ikon]}</svg>
          {ad}
        </Link>
      ))}
    </nav>
  );
}
