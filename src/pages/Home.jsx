import { useNavigate } from "react-router-dom";
import "../styles/Home.css";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="hero">
      <div className="overlay">
        <h1>ZANY Nail Spa</h1>
        <p>Làm đẹp – Thư giãn – Tỏa sáng</p>
        <button onClick={() => navigate("/services")}>
          Xem Dịch Vụ
        </button>
      </div>
    </div>
  );
}

export default Home;