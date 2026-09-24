export const metadata = { title: "Byredo La Tulipe · Ebru Koç" };

const MARKALAR = [
  { marka: "Hermès", aks: "Parfüm", adet: 61, esas: "374.653,24", prim: "%1 yazılıyor" },
  { marka: "Hermès", aks: "Makyaj", adet: 65, esas: "223.219,70", prim: "%1 yazılıyor" },
  { marka: "La Prairie", aks: "Cilt bakım", adet: 4, esas: "77.666,68", prim: "%1 yazılıyor" },
  { marka: "Byredo", aks: "Boş", adet: 2, esas: "6.472,50", prim: "%1 yok" },
];

const LP = [
  ["Skin Caviar Liquid Lift 30 ml", "2", "53.083,34"],
  ["SC Luxe Cream 30 ml", "1", "19.416,67"],
  ["Foam Cleanser 125 ml", "1", "5.166,67"],
];

export default function ByredoLaTulipePage() {
  return (
    <div>
      <h2>Byredo La Tulipe</h2>
      <p className="aciklama">
        Ebru Koç, Beymen Tersane. Byredo satışı tek ürün: La Tulipe vücut kremi, 200 ml.
        Parfüm değil. 2 adet, prime esas 6.472,50 TL. Bu tutara %1 yazılmıyor.
      </p>

      <div className="kartlar">
        <div className="kart">
          <div className="etiket">Ürün</div>
          <div className="deger" style={{ fontSize: 22 }}>La Tulipe Body Cream</div>
          <div className="alt">BYR65202560 · 7340032860009</div>
        </div>
        <div className="kart">
          <div className="etiket">Adet</div>
          <div className="deger">2</div>
          <div className="alt">Beymen Tersane</div>
        </div>
        <div className="kart">
          <div className="etiket">Prime esas</div>
          <div className="deger" style={{ fontSize: 22 }}>6.472,50 TL</div>
          <div className="alt">%1 yok</div>
        </div>
      </div>

      <h3 style={{ margin: "8px 0 12px", fontSize: 16 }}>Ebru’nun sattığı markalar</h3>
      <table>
        <thead>
          <tr>
            <th>Marka</th>
            <th>Grup</th>
            <th className="sag">Adet</th>
            <th className="sag">Prime esas</th>
            <th>Prim %1</th>
          </tr>
        </thead>
        <tbody>
          {MARKALAR.map((r) => (
            <tr key={r.marka + r.aks} style={r.marka === "Byredo" ? { background: "#fdf3e3" } : undefined}>
              <td>{r.marka}</td>
              <td>{r.aks}</td>
              <td className="sag">{r.adet}</td>
              <td className="sag">{r.esas} TL</td>
              <td>{r.prim}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ margin: "28px 0 12px", fontSize: 16 }}>La Prairie, cilt bakım</h3>
      <table>
        <thead>
          <tr>
            <th>Ürün</th>
            <th className="sag">Adet</th>
            <th className="sag">Prime esas</th>
          </tr>
        </thead>
        <tbody>
          {LP.map((r) => (
            <tr key={r[0]}>
              <td>{r[0]}</td>
              <td className="sag">{r[1]}</td>
              <td className="sag">{r[2]} TL</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
