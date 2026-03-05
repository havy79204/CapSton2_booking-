import { useEffect, useState } from "react";
import axios from "axios";
import "../styles/ServiceList.css";

function ServiceList() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:5000/api/services")
      .then(res => setServices(res.data))
      .catch(err => console.log(err));
  }, []);

  return (
    <div className="service-container">
      <h2>Dịch Vụ Của Chúng Tôi</h2>

      <div className="service-grid">
        {services.map(service => (
          <div key={service.ServiceId} className="card">
            <h3>{service.ServiceName}</h3>
            <p>{service.Description}</p>
            <p className="price">{service.Price} VND</p>
            <button>Đặt Ngay</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ServiceList;