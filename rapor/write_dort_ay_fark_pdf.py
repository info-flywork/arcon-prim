#!/usr/bin/env python3
"""Prim Modülü − Birol Bey: 4 ay TÜM prim kolonları fark metin PDF + ortak hatalı isimler."""
from __future__ import annotations

import csv
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import openpyxl
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))

ATT = Path(
    "/Users/flywork/.cursor/projects/Users-flywork-Desktop-arcon-prim-tuna-2/attachments/"
    "aed46409-fd82-4252-9272-340f28c9bfed"
)
OUT_DIR = Path("/Users/flywork/Desktop")
OUT_PDF = OUT_DIR / "Dört Ay Prim Fark Raporu.pdf"

# Biz Excel sabit indeksler (satır 6 başlık)
BIZ_COLS = [
    ("F", 5, "Satıştan gelen %1 prim"),
    ("G", 6, "Sephora Bağdat / Beymen ekstra %0,05"),
    ("H", 7, "Sensai ekstra %1"),
    ("I", 8, "Sevil DG+LP ekstra %0,05"),
    ("J", 9, "Satış primlerinin toplamı"),
    ("L", 11, "Hedef tutunca gelen prim"),
    ("M", 12, "Dior mağazada 1. olunca"),
    ("N", 13, "Dior makyajda 1. olunca"),
    ("O", 14, "Dior parfümde ilk 2"),
    ("P", 15, "Dior cilt bakımda ilk 3"),
    ("Q", 16, "LP / cilt / diğer sıralama primi"),
    ("R", 17, "Parfüm sıralama %1"),
    ("S", 18, "Parfüm sıralama %0,5"),
    ("T", 19, "Parfüm sıralama ikinci %0,5"),
    ("U", 20, "Geçen aydan kalan"),
    ("V", 21, "Ek prim %0,20"),
    ("W", 22, "Kişinin toplam primi"),
]
KOL_KEYS = [k for k, _, _ in BIZ_COLS]
KOL_LABEL = {k: lab for k, _, lab in BIZ_COLS}
BIZ_IDX = {k: idx for k, idx, _ in BIZ_COLS}

# Birol başlık → kolon anahtarı (öncelik sırası önemli)
# (key, needles, forbid_substrings)
BIROL_MATCHERS = [
    ("W", ["TOPLAM PRIM"], ["ESAS", "YUZDE", "EK PRIM", "%"]),
    ("V", ["EK PRIM"], []),
    ("U", ["KALAN"], []),
    ("R", ["PARFUM % 1"], []),
    ("Q", ["LP MAGAZA"], []),
    ("P", ["DIOR CILT"], []),
    ("O", ["DIOR PARFUM"], []),
    ("N", ["DIOR MAKYAJ"], []),
    ("M", ["DIOR MAGAZA"], []),
    ("L", ["HEDEF PRIM", "HEDEF  PRIM"], ["HEDEFLER"]),
    ("J", ["SATIS PRIMI"], []),
    ("I", ["SEVIL DG", "SEVIL"], ["BAGDAT"]),
    ("H", ["SENSAI"], []),
    ("G", ["SEPHORA BAGDAT", "BAGDAT + BEYMEN", "BEYMEN + % 0,05"], []),
    ("F", ["PRIM % 1", "PRIM  % 1"], ["PARFUM"]),
]

DONEMLER = [
    {
        "ad": "Haziran 2026",
        "biz": Path("/Users/flywork/Downloads/Prim_Hesaplama_Haziran 2026.xlsx"),
        "birol": ATT / "2026_Haziran_Prim_C_al_s_ma.xlsm_-_Prim_Hesaplama.csv",
        "birol_toplam": "suffix",
    },
    {
        "ad": "Temmuz 2026",
        "biz": Path("/Users/flywork/Downloads/Prim_Hesaplama_Temmuz 2026.xlsx"),
        "birol": ATT / "2026_Temmuz_Prim_C_al_s_ma.xlsm_-_Prim_Hesaplama.csv",
        "birol_toplam": "suffix",
    },
    {
        "ad": "Ağustos 2026",
        "biz": Path("/Users/flywork/Downloads/Prim_Hesaplama_Ağustos 2026.xlsx"),
        "birol": ATT / "2026_Ag_ustos_Prim_C_al_s_ma.xlsm_-_Prim_Hesaplama.csv",
        "birol_toplam": "suffix",
    },
    {
        "ad": "Eylül 2026",
        "biz": Path("/Users/flywork/Downloads/Prim_Hesaplama_Eylül 2026.xlsx"),
        "birol": ATT
        / "2026_Eylu_l_Prim_C_al_s_ma_Sat_s__Mu_du_rleri_Revize_o_ncesi_-Formu_lsu_z.xlsm_-_Prim_Hesaplama_Formu_lsu_z.csv",
        "birol_toplam": "prefix",
    },
]

NAVY = HexColor("#1F3864")
BLUE = HexColor("#2E74B5")
LINE = HexColor("#DDE3EA")
MUTED = HexColor("#555555")
ROW_ALT = HexColor("#F7F9FC")


def norm_name(s: str) -> str:
    s = str(s or "").strip()
    s = re.sub(r"^(Toplam\s+)", "", s, flags=re.I)
    s = re.sub(r"\s+Toplam$", "", s, flags=re.I)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper().replace("İ", "I")
    s = re.sub(r"[^A-Z0-9 ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_hdr(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper().replace("İ", "I").replace("\n", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_tl(x) -> float:
    if x is None:
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).replace("\xa0", " ").replace("TL.", "").replace("TL", "").strip()
    if not s or s in ("-", "—", "."):
        return 0.0
    s = s.replace(" ", "")
    neg = s.startswith("-") or s.startswith("(")
    s = s.strip("-()")
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return 0.0


def tl(n: float) -> str:
    sign = "-" if n < 0 else ""
    n = abs(float(n))
    whole = int(round(n * 100))
    w, c = divmod(whole, 100)
    s = f"{w:,}".replace(",", ".")
    return f"{sign}{s},{c:02d}"


def kanal_from_magaza(mag: str) -> str:
    m = (mag or "").upper().replace("İ", "I")
    tags = []
    if "SEPHORA" in m:
        tags.append("SEPHORA")
    if "BEYMEN" in m:
        tags.append("BEYMEN")
    if "BOYNER" in m:
        tags.append("BOYNER")
    if "SEVIL" in m:
        tags.append("SEVİL")
    if "COMMUNITE" in m:
        tags.append("COMMUNITE")
    return " · ".join(tags) if tags else "—"


def map_birol_headers(hdr: list) -> dict:
    """kolon_key -> csv index. S/T ayrımı: iki Parfüm %0,5 varsa sırayla S sonra T."""
    mapped = {}
    used = set()
    norms = [norm_hdr(c) for c in hdr]

    # Parfüm %0,5 çiftini özel yakala
    p05 = [j for j, n in enumerate(norms) if "PARFUM" in n and "0,5" in n]
    if len(p05) >= 2:
        mapped["S"] = p05[0]
        mapped["T"] = p05[1]
        used.update(p05[:2])
    elif len(p05) == 1:
        mapped["S"] = p05[0]
        used.add(p05[0])

    for key, needles, forbid in BIROL_MATCHERS:
        if key in mapped:
            continue
        for j, n in enumerate(norms):
            if j in used or not n:
                continue
            if any(f in n for f in forbid):
                continue
            if any(nd in n for nd in needles):
                # W: "TOPLAM PRIM" ama "TOPLAM PRIME ESAS" değil
                if key == "W":
                    if "ESAS" in n or "YUZDE" in n:
                        continue
                    # yalnızca toplam prim kolonu
                    if not re.search(r"TOPLAM\s+PRIM\s*$", n) and "TOPLAM PRIM" not in n.replace("  ", " "):
                        continue
                    if "PRIME" in n:
                        continue
                if key == "F" and "PARFUM" in n:
                    continue
                if key == "G" and "TOPLAM SEPHORA" in n and "BAGDAT" not in n:
                    # boş ara toplam; Bağdat satırını bekle
                    continue
                mapped[key] = j
                used.add(j)
                break

    # G yedek: Bağdat yoksa Sephora + Beymen
    if "G" not in mapped:
        for j, n in enumerate(norms):
            if j in used:
                continue
            if "SEPHORA" in n and "BEYMEN" in n:
                mapped["G"] = j
                used.add(j)
                break
            if n.strip() in ("TOPLAM SEPHORA", "TOPLAM SEPHORA "):
                mapped["G"] = j
                used.add(j)
                break
    return mapped


def load_biz(path: Path) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    out = {}
    cur_mags = set()
    for row in ws.iter_rows(min_row=7, values_only=True):
        a = row[0]
        if a is None:
            continue
        a = str(a).strip()
        if not a:
            continue
        if a.startswith("Toplam "):
            ad = a[7:].strip()
            if ad.lower().startswith("genel"):
                continue
            vals = {k: round(float(row[BIZ_IDX[k]] or 0), 2) for k in KOL_KEYS}
            out[norm_name(ad)] = {"ad": ad, "kanal": kanal_from_magaza(" ".join(cur_mags)), **vals}
            cur_mags = set()
            continue
        if not a.lower().startswith("toplam"):
            mag = row[2]
            if mag:
                cur_mags.add(str(mag))
    return out


def load_birol(path: Path, mode: str) -> dict:
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f))
    hi = next(
        (
            i
            for i, r in enumerate(rows[:12])
            if any(x in (c or "") for c in r for x in ("Uzman", "Satır Etiketleri", "Satir Etiketleri"))
        ),
        0,
    )
    colmap = map_birol_headers(rows[hi])
    print("  birol map", {k: colmap.get(k) for k in KOL_KEYS})
    out = {}
    for r in rows[hi + 1 :]:
        a = (r[0] or "").strip()
        if not a or "Genel" in a:
            continue
        if mode == "suffix":
            if not a.endswith(" Toplam"):
                continue
            ad = a[: -len(" Toplam")].strip()
        else:
            if not a.startswith("Toplam "):
                continue
            ad = a[7:].strip()
        vals = {}
        for k in KOL_KEYS:
            j = colmap.get(k)
            vals[k] = round(parse_tl(r[j]) if j is not None and j < len(r) else 0, 2)
        # J yoksa F+G+H+I ≈ satış primi
        if (colmap.get("J") is None or vals["J"] == 0) and (vals["F"] or vals["G"] or vals["H"] or vals["I"]):
            vals["J"] = round(vals["F"] + vals["G"] + vals["H"] + vals["I"], 2)
        # W formül cache boşsa bileşenlerden kur (J dahil satış; R/S/T/L/… ayrı)
        bilesen = (
            vals["J"]
            + vals["L"]
            + vals["M"]
            + vals["N"]
            + vals["O"]
            + vals["P"]
            + vals["Q"]
            + vals["R"]
            + vals["S"]
            + vals["T"]
            + vals["U"]
            + vals["V"]
        )
        # J yokken F+G zaten J'ye yazıldı; J=0 ve F>0 ise F+G ekle
        if vals["J"] == 0:
            bilesen += vals["F"] + vals["G"] + vals["H"] + vals["I"]
        if vals["W"] == 0 and bilesen > 0:
            vals["W"] = round(bilesen, 2)
        out[norm_name(ad)] = {"ad": ad, **vals}
    return out


def compare(biz: dict, birol: dict):
    ozet = {k: {"biz": 0.0, "birol": 0.0, "fark": 0.0} for k in KOL_KEYS}
    for d in biz.values():
        for k in KOL_KEYS:
            ozet[k]["biz"] += d[k]
    for d in birol.values():
        for k in KOL_KEYS:
            ozet[k]["birol"] += d[k]
    for k in KOL_KEYS:
        ozet[k]["biz"] = round(ozet[k]["biz"], 2)
        ozet[k]["birol"] = round(ozet[k]["birol"], 2)
        ozet[k]["fark"] = round(ozet[k]["biz"] - ozet[k]["birol"], 2)

    kisiler = []
    for key in set(biz) | set(birol):
        b = biz.get(key)
        r = birol.get(key)
        ad = (b or r)["ad"]
        kanal = (b or {}).get("kanal") or "—"
        satirlar = []
        net = 0.0
        for k in KOL_KEYS:
            if k == "W":
                # W özet; isim satırlarında çift saymamak için kişi net'ine W'yi
                # ayrı tutuyoruz ama kolon farkına dahil ediyoruz
                pass
            bv = (b or {}).get(k, 0) or 0
            rv = (r or {}).get(k, 0) or 0
            fark = round(bv - rv, 2)
            if abs(fark) < 1:
                continue
            satirlar.append({"kolon": k, "biz": bv, "birol": rv, "fark": fark})
            if k != "W":
                net += fark
        if satirlar:
            # kişi net: W varsa W farkını tercih et (gerçek toplam), yoksa bileşen toplamı
            w_fark = next((s["fark"] for s in satirlar if s["kolon"] == "W"), None)
            kisiler.append(
                {
                    "ad": ad,
                    "key": key,
                    "kanal": kanal,
                    "satirlar": satirlar,
                    "net": round(w_fark if w_fark is not None else net, 2),
                }
            )
    kisiler.sort(key=lambda x: abs(x["net"]), reverse=True)
    return ozet, kisiler


def styles():
    return {
        "title": ParagraphStyle("t", fontName="Arial-Bold", fontSize=16, textColor=NAVY, spaceAfter=6, alignment=TA_CENTER),
        "sub": ParagraphStyle("s", fontName="Arial", fontSize=10, textColor=MUTED, spaceAfter=10, alignment=TA_CENTER),
        "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=12, textColor=BLUE, spaceBefore=14, spaceAfter=8),
        "body": ParagraphStyle("b", fontName="Arial", fontSize=9, textColor=HexColor("#1f2a37"), leading=13, spaceAfter=6),
        "note": ParagraphStyle("n", fontName="Arial", fontSize=8.5, textColor=MUTED, leading=12, spaceAfter=8),
        "th": ParagraphStyle("th", fontName="Arial-Bold", fontSize=7.5, textColor=white, leading=9),
        "td": ParagraphStyle("td", fontName="Arial", fontSize=7.5, textColor=HexColor("#1f2a37"), leading=9),
        "tdR": ParagraphStyle("tdR", fontName="Arial", fontSize=7.5, textColor=HexColor("#1f2a37"), leading=9, alignment=TA_RIGHT),
        "tdB": ParagraphStyle("tdB", fontName="Arial-Bold", fontSize=7.5, textColor=HexColor("#1f2a37"), leading=9),
        "foot": ParagraphStyle("f", fontName="Arial", fontSize=8, textColor=MUTED, alignment=TA_CENTER),
    }


def table_style(nrows: int):
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Arial-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, NAVY),
    ]
    for i in range(1, nrows):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    return TableStyle(cmds)


def build_month_section(story, st, donem_ad, ozet, kisiler):
    story.append(Paragraph(donem_ad, st["h2"]))
    story.append(
        Paragraph(
            "<b>Bu ay ne bakıyoruz?</b> Bizim programın verdiği prim ile Birol Bey’in Excel’indeki prim. "
            "Aynı kişi, aynı prim kalemi yan yana. "
            "<b>Fark = bizim rakam − Birol’un rakamı.</b> "
            "Artı (+) = biz daha çok yazmışız. Eksi (−) = Birol daha çok yazmış.",
            st["note"],
        )
    )
    story.append(Paragraph("1) Önce her prim kaleminin ay toplamı", st["body"]))

    rows = [[Paragraph(x, st["th"]) for x in ["Hangi prim?", "Bizim toplam", "Birol’un toplamı", "Fark"]]]
    for k in KOL_KEYS:
        o = ozet[k]
        rows.append(
            [
                Paragraph(f"{k} · {KOL_LABEL[k]}", st["td"]),
                Paragraph(tl(o["biz"]), st["tdR"]),
                Paragraph(tl(o["birol"]), st["tdR"]),
                Paragraph(tl(o["fark"]), st["tdR"]),
            ]
        )
    # J zaten F–I toplamı → bileşende F–I'yi sayma; W ayrıca
    comp = ["J", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V"]
    tot_b = sum(ozet[k]["biz"] for k in comp)
    tot_r = sum(ozet[k]["birol"] for k in comp)
    tot_f = sum(ozet[k]["fark"] for k in comp)
    rows.append(
        [
            Paragraph("Parça parça toplam (W hariç)", st["tdB"]),
            Paragraph(tl(tot_b), st["tdR"]),
            Paragraph(tl(tot_r), st["tdR"]),
            Paragraph(tl(tot_f), st["tdR"]),
        ]
    )
    t = Table(rows, colWidths=[100 * mm, 28 * mm, 28 * mm, 28 * mm])
    t.setStyle(table_style(len(rows)))
    story.append(t)
    story.append(
        Paragraph(
            f"<b>Bu ayın özeti:</b> Kişinin cebine giden toplam prim (W) farkı "
            f"<b>{tl(ozet['W']['fark'])} TL</b>. "
            f"(Parça parça bakınca fark <b>{tl(tot_f)} TL</b>.)",
            st["body"],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("2) Sonra kişi kişi — kimde ne bozulmuş?", st["body"]))
    story.append(
        Paragraph(
            "Aşağıda sadece farkı 1 TL’den büyük olanlar var. "
            "Bir kişinin altında birden fazla satır olabilir (ör. birinde Dior, birinde parfüm). "
            "<b>Kişi toplamı</b> = o kişinin toplam prim farkı.",
            st["note"],
        )
    )

    data = [[Paragraph(x, st["th"]) for x in ["Kişi", "Mağaza türü", "Hangi prim?", "Biz", "Birol", "Fark"]]]
    for kisi in kisiler:
        first = True
        for s in kisi["satirlar"]:
            data.append(
                [
                    Paragraph(kisi["ad"] if first else "", st["tdB"] if first else st["td"]),
                    Paragraph(kisi["kanal"] if first else "", st["td"]),
                    Paragraph(f"{s['kolon']} · {KOL_LABEL[s['kolon']]}", st["td"]),
                    Paragraph(tl(s["biz"]), st["tdR"]),
                    Paragraph(tl(s["birol"]), st["tdR"]),
                    Paragraph(tl(s["fark"]), st["tdR"]),
                ]
            )
            first = False
        data.append(
            [
                Paragraph("→ Bu kişinin toplam farkı", st["tdB"]),
                Paragraph("", st["td"]),
                Paragraph("", st["td"]),
                Paragraph("", st["td"]),
                Paragraph("", st["td"]),
                Paragraph(tl(kisi["net"]), st["tdR"]),
            ]
        )

    chunk = 45
    body = data[1:]
    for i in range(0, len(body), chunk):
        part = [data[0]] + body[i : i + chunk]
        tt = Table(part, colWidths=[34 * mm, 24 * mm, 58 * mm, 22 * mm, 22 * mm, 22 * mm], repeatRows=1)
        tt.setStyle(table_style(len(part)))
        story.append(tt)
        story.append(Spacer(1, 2 * mm))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    st = styles()
    results = []
    for d in DONEMLER:
        print("loading", d["ad"], "...")
        biz = load_biz(d["biz"])
        birol = load_birol(d["birol"], d["birol_toplam"])
        ozet, kisiler = compare(biz, birol)
        print(
            " ",
            d["ad"],
            "biz",
            len(biz),
            "birol",
            len(birol),
            "farklı kişi",
            len(kisiler),
            "ΔW",
            ozet["W"]["fark"],
        )
        results.append({"ad": d["ad"], "ozet": ozet, "kisiler": kisiler})

    sets = [{k["key"] for k in r["kisiler"]} for r in results]
    maps = [{k["key"]: k for k in r["kisiler"]} for r in results]
    ortak_keys = set.intersection(*sets) if sets else set()
    ortak = []
    for key in ortak_keys:
        nets = [maps[i][key]["net"] for i in range(4)]
        ad = maps[-1][key]["ad"]
        ortak.append({"ad": ad, "key": key, "nets": nets, "abs_sum": sum(abs(x) for x in nets)})
    ortak.sort(key=lambda x: -x["abs_sum"])
    print("ortak hatalı", len(ortak))

    def header(canvas, doc):
        canvas.saveState()
        canvas.setFont("Arial", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(14 * mm, A4[1] - 12 * mm, "Bizim prim vs Birol’un prim — Haziran–Eylül 2026")
        canvas.drawRightString(A4[0] - 14 * mm, A4[1] - 12 * mm, str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(OUT_PDF),
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=18 * mm,
        bottomMargin=12 * mm,
    )
    story = []
    story.append(Paragraph("Dört Ay Prim Fark Raporu", st["title"]))
    story.append(Paragraph("Haziran · Temmuz · Ağustos · Eylül 2026", st["sub"]))
    story.append(
        Paragraph(
            "<b>Bu rapor ne işe yarar?</b><br/>"
            "Bizim sistem bir prim yazıyor. Birol Bey’in Excel’i başka bir prim yazıyor. "
            "Bu dosya ikisini yan yana koyup <b>“fark nerede?”</b> diye gösteriyor.<br/><br/>"
            "<b>Nasıl okunur?</b><br/>"
            "• <b>Biz</b> = bizim programın sonucu<br/>"
            "• <b>Birol</b> = Birol Bey’in Excel sonucu<br/>"
            "• <b>Fark</b> = Biz − Birol<br/>"
            "• Fark <b>artı (+)</b> ise biz fazla vermişiz<br/>"
            "• Fark <b>eksi (−)</b> ise Birol fazla vermiş (biz eksik kalmışız)<br/><br/>"
            "Her ay önce <b>kalem kalem toplam</b>, sonra <b>isim isim</b> listelenir. "
            "En sonda dört ayın hepsinde de fark çıkan kişiler var.",
            st["note"],
        )
    )

    for r in results:
        build_month_section(story, st, r["ad"], r["ozet"], r["kisiler"])
        story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("Dört ayda da bozulan isimler (ortak liste)", st["h2"]))
    story.append(
        Paragraph(
            f"Bunlar rastgele bir ayda değil — <b>Haziran, Temmuz, Ağustos ve Eylül’ün hepsinde</b> "
            f"bizimle Birol arasında fark çıkan kişiler. Toplam <b>{len(ortak)}</b> kişi.<br/>"
            "Sayılar o ayın <b>toplam prim farkı</b>. "
            "Sağdaki Σ|net| = dört aydaki farkların büyüklük toplamı (işaret yok sayılır); "
            "büyük olan = dört ayda en çok sapmış kişi.",
            st["note"],
        )
    )
    rows = [
        [Paragraph(x, st["th"]) for x in ["#", "Kişi", "Haziran", "Temmuz", "Ağustos", "Eylül", "4 ay toplam |fark|"]]
    ]
    for i, o in enumerate(ortak, 1):
        rows.append(
            [
                Paragraph(str(i), st["td"]),
                Paragraph(o["ad"], st["tdB"]),
                Paragraph(tl(o["nets"][0]), st["tdR"]),
                Paragraph(tl(o["nets"][1]), st["tdR"]),
                Paragraph(tl(o["nets"][2]), st["tdR"]),
                Paragraph(tl(o["nets"][3]), st["tdR"]),
                Paragraph(tl(o["abs_sum"]), st["tdR"]),
            ]
        )
    body = rows[1:]
    for i in range(0, len(body), 40):
        part = [rows[0]] + body[i : i + 40]
        tt = Table(part, colWidths=[8 * mm, 42 * mm, 24 * mm, 24 * mm, 24 * mm, 24 * mm, 24 * mm], repeatRows=1)
        tt.setStyle(table_style(len(part)))
        story.append(tt)
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(f"Flywork · {datetime.now().strftime('%d.%m.%Y %H:%M')}", st["foot"]))
    doc.build(story, onFirstPage=header, onLaterPages=header)
    print("PDF:", OUT_PDF)


if __name__ == "__main__":
    main()
