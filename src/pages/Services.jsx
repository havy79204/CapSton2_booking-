import "../styles/Services.css";

function Services() {
  return (
    <div className="services-container">
      <h2>Dịch Vụ Nail</h2>

      <div className="service-list">
        <div className="service-card">
          <h3>Sơn Gel</h3>
          <p>Giữ màu bền 3-4 tuần</p>
          <span>200.000đ</span>
        </div>

        <div className="service-card">
          <h3>Nối Móng</h3>
          <p>Form tự nhiên – chắc chắn</p>
          <span>350.000đ</span>
        </div>

        <div className="service-card">
          <h3>Vẽ Nail Art</h3>
          <p>Thiết kế theo yêu cầu</p>
          <span>150.000đ</span>
        </div>
      </div>
    </div>
  );
}

export default Services;