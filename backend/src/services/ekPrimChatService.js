const store = require("./ekPrimStore");

const SYSTEM_PROMPT = `Sen Arcon Prim Sistemi'nin istisna / ek maliyet asistanısın.
Kullanıcı kurallar dışı prim ve maliyetleri A'dan Z'ye kaydeder; sen sorularla eksikleri tamamlar, doğru kolonu önerir ve kaydı onaylatırsın.

## Tipik senaryolar
1) **İşten ayrılma / marka devralma**: 2+ uzmanlı mağazada biri ayrılır; kalan uzman yeni biri gelene kadar tüm markalardan sorumlu olur → prim buna göre eklenir/düzeltilir.
2) **Yıllık / özel izin**: Destek personel gönderilemediğinde Satış Müdürü, uzmanın mağazada olduğu dönem sıralamasına göre değerlendirme ister.
3) **İnisiyatif**: Satış Müdürü kurallar dışında uzman seçer; **Genel Müdür Yrd. Semra Hanım onayından sonra** işlenir. Onay notu zorunlu.
4) **Toplu / kurumsal satış sıralama kaybı**: Mağazada toplu veya kurumsal satış yüzünden sıralama bozulur; Satış Müdürü bunu tespit eder ve **prim hesaplanmadan önce** sisteme yükler. Tip: \`toplu_kurumsal_siralama\`. Genelde etkilenen sıralama kolonu (**R/S/T** veya sabit düzeltme için **Q**) + X açıklama.

## Prim kolonları (Excel / rapor)
- **E**: Prime esas ciro (genelde elle eklenmez)
- **F**: Prim %1 (satış primi)
- **G**: Bağdat Sisley + Beymen %0,05
- **H**: Sensai Sephora %1
- **I**: Sevil DG + LP %0,05
- **J**: Toplam satış primi (F+G+H+I; elle yazma)
- **L**: Hedef prim %0,50
- **M–P**: Dior mağaza/makyaj/parfüm/cilt
- **Q**: LP mağaza, cilt 1.lik ve **diğer sıralama / sabit TL ekstra** ← sabit tutarlı inisiyatif, koruma, destek primi için varsayılan
- **R**: Parfüm %1 (sıralama)
- **S / T**: Parfüm %0,5
- **U**: Önceki aydan kalan
- **V**: Ek prim %0,20 (yüzde kolonu; sabit 10.000 TL için uygun değil)
- **W**: Toplam prim (toplam; elle yazma)
- **X**: Prim açıklama (mutlaka not düş)

## Kolon seçim kuralı (kullanıcıya sade anlat)
- Sabit TL ekstra (ör. "Murat Ekinci'ye 10.000 ekstra"): **Q** + X'e açıklama.
- Parfüm sıralama düzeltmesi / kurumsal satış kaybı telafisi: **R / S / T** (hangisi senaryoya uyuyorsa) veya belirsizse **Q** + X.
- Dior özel: **M–P** + X.
- Onaylı inisiyatif: **Q** + X'te "Semra Hanım onayı: …".

## Excel
Kayıtlar dönem dosyasına yazılır. Kullanıcı "excel'e işle / indir" derse \`excel_hazirla\` tool'unu çağır; Prim Hesaplama sheet'ine kolon kolon işlenmiş dosyanın indir linkini söyle:
\`/api/istisna-prim/{donemId}/xlsx-uygula\`

## Konuşma stili
- Türkçe, kısa, net. Bir seferde 1–2 soru sor.
- Eksikse sırayla sor: uzman adı → tutar → dönem (varsa) → mağaza → tip → kolon önerisi → onay/açıklama.
- Kullanıcı "kaydet" demeden tool çağırma; özeti gösterip onay al.
- Teknik jargon yerine "Q kolonu (LP ve diğer / ekstra sabit prim)" de.

## Tool kullanımı
- Kaydı netleştirince \`kaydet_istisna\` çağır.
- Liste isteğinde \`listele_istisna\`.
- Silme için \`sil_istisna\` (id gerekir).
- Excel (istisna işli Prim Hesaplama) için \`excel_hazirla\`.
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "kaydet_istisna",
      description: "Onaylanan istisna/ek prim kaydını döneme yazar.",
      parameters: {
        type: "object",
        properties: {
          uzman: { type: "string" },
          magaza: { type: "string" },
          kanal: { type: "string" },
          tutar: { type: "number", description: "TL tutar (pozitif veya negatif düzeltme)" },
          kolon: {
            type: "string",
            description: "Hedef kolon kodu: Q, R, S, T, M, N, O, P, L, V, U",
          },
          tip: {
            type: "string",
            enum: [
              "isten_ayrilma_devralma",
              "izin_siralamasi",
              "inisiyatif_onayli",
              "koruma_primi",
              "toplu_kurumsal_siralama",
              "diger",
            ],
          },
          onay: { type: "string", description: "Örn. Semra Hanım onayı / Satış Müdürü tespiti" },
          aciklama: { type: "string" },
        },
        required: ["uzman", "tutar", "kolon", "tip", "aciklama"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listele_istisna",
      description: "Dönemdeki kayıtlı istisna/ek primleri listeler.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sil_istisna",
      description: "Kayıt id ile istisnayı siler.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "excel_hazirla",
      description:
        "İstisna kayıtlarının Prim Hesaplama Excel'ine işlendiği dosyanın indirme bilgisini döner.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function openaiKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OpenAI_API_KEY ||
    process.env.OPEN_AI_API_KEY ||
    ""
  ).trim();
}

async function openaiChat(messages) {
  const key = openaiKey();
  if (!key) {
    const err = new Error("OpenAI API anahtarı yok. backend/.env içine OPENAI_API_KEY ekleyin.");
    err.code = "no_key";
    throw err;
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI yanıtı okunamadı: ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 300);
    const err = new Error(msg);
    err.code = "openai_http";
    err.status = res.status;
    throw err;
  }
  return data;
}

function toolSonuc(donemId, name, args) {
  if (name === "listele_istisna") {
    const liste = store.oku(donemId);
    return {
      adet: liste.length,
      kayitlar: liste.map((k) => ({
        id: k.id,
        uzman: k.uzman,
        magaza: k.magaza,
        tutar: k.tutar,
        kolon: k.kolon,
        tip: k.tip,
        onay: k.onay,
        aciklama: k.aciklama,
      })),
    };
  }
  if (name === "sil_istisna") {
    return store.sil(donemId, args.id);
  }
  if (name === "kaydet_istisna") {
    return store.ekle(donemId, args);
  }
  if (name === "excel_hazirla") {
    const liste = store.oku(donemId);
    return {
      adet: liste.length,
      indir_url: `/api/istisna-prim/${donemId}/xlsx-uygula`,
      sadece_liste_url: `/api/istisna-prim/${donemId}/xlsx`,
      not: "Prim Hesaplama sheet'ine istisnalar kolon kolon işlenmiş Excel. Paneldeki 'Prim Excel (işli)' butonuyla da iner.",
    };
  }
  return { hata: "bilinmeyen tool" };
}

/**
 * @param {number} donemId
 * @param {Array<{role:string, content?:string, tool_calls?:any, tool_call_id?:string, name?:string}>} history
 * @param {string} userMessage
 */
async function sohbet(donemId, history, userMessage) {
  const donemNotu = `Aktif dönem id: ${donemId}. Kayıtlar bu döneme yazılır.`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + "\n\n" + donemNotu },
    ...sanitizeHistory(history),
    { role: "user", content: String(userMessage || "").slice(0, 4000) },
  ];

  let data = await openaiChat(messages);
  let choice = data.choices?.[0]?.message;
  if (!choice) throw new Error("OpenAI boş yanıt döndü");

  const kaydedilen = [];
  // En fazla 4 tool turu
  for (let tur = 0; tur < 4; tur++) {
    const calls = choice.tool_calls;
    if (!calls || !calls.length) break;

    messages.push({
      role: "assistant",
      content: choice.content || null,
      tool_calls: calls,
    });

    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const sonuc = toolSonuc(donemId, call.function?.name, args);
      if (call.function?.name === "kaydet_istisna" && sonuc?.id) kaydedilen.push(sonuc);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(sonuc),
      });
    }

    data = await openaiChat(messages);
    choice = data.choices?.[0]?.message;
    if (!choice) break;
  }

  return {
    reply: choice.content || "Tamam.",
    kaydedilen,
    kayitlar: store.oku(donemId),
  };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-16)
    .map((m) => {
      if (m.role === "user" || m.role === "assistant") {
        return { role: m.role, content: String(m.content || "").slice(0, 4000) };
      }
      return null;
    })
    .filter(Boolean);
}

module.exports = { sohbet, openaiKey, SYSTEM_PROMPT };
