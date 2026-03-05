import { useEffect, useState } from "react";
import { getSalons } from "../lib/api";
import "../styles/SalonList.css";

function SalonList({ onSelect }) {
  const [salons, setSalons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSalons()
      .then(res => {
        setSalons(Array.isArray(res) ? res : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Không thể tải danh sách salon");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="loading">Đang tải...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="salon-container">
      <h1>🏢 Danh sách Salon</h1>
      <div className="salon-grid">
        {salons && salons.length > 0 ? (
          salons.map((s) => (
            <div
              key={s.SalonId || s.id}
              className="salon-card"
              onClick={() => onSelect(s)}
            >
              <h3>{s.Name || "Salon"}</h3>
              {s.Tagline && <p className="tagline">{s.Tagline}</p>}
              {s.Address && <p className="address">📍 {s.Address}</p>}
              {s.Rating && <p className="rating">⭐ {s.Rating.toFixed(1)} Stars</p>}
              <button className="select-btn">Chọn Salon</button>
            </div>
          ))
        ) : (
          <p>Không có salon nào</p>
        )}
      </div>
    </div>
  );
}

export default SalonList;