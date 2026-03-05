import { useState } from "react";
import { createBooking } from "../lib/api";
import "../styles/BookingForm.css";

function BookingForm({ salon, service, onSuccess, onBack }) {
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    bookingDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const bookingData = {
        serviceId: service.ServiceId || service.id,
        customerName: form.customerName,
        phone: form.phone,
        bookingDate: form.bookingDate || new Date().toISOString().split('T')[0],
      };

      await createBooking(bookingData);
      setSuccess(true);
      setForm({ customerName: "", phone: "", bookingDate: "" });
      
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Lỗi đặt lịch");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="booking-success">
        <div className="success-message">
          <h2>✅ Đặt lịch thành công!</h2>
          <p>Cảm ơn bạn đã lựa chọn dịch vụ của chúng tôi.</p>
          <p>Quay lại trang chủ trong 2 giây...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-container">
      <button className="back-btn" onClick={onBack}>← Quay lại</button>
      
      <div className="booking-summary">
        <h2>🎟️ Đặt Dịch Vụ</h2>
        <p><strong>Salon:</strong> {salon.Name}</p>
        <p><strong>Dịch vụ:</strong> {service.Name}</p>
        <p><strong>Giá:</strong> {service.Price || 0}đ</p>
      </div>

      <form className="booking-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Tên khách hàng *</label>
          <input
            type="text"
            name="customerName"
            placeholder="Nhập tên của bạn"
            value={form.customerName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Số điện thoại *</label>
          <input
            type="tel"
            name="phone"
            placeholder="Nhập số điện thoại"
            value={form.phone}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Ngày đặt lịch</label>
          <input
            type="date"
            name="bookingDate"
            value={form.bookingDate}
            onChange={handleChange}
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? "Đang xử lý..." : "Đặt ngay"}
        </button>
      </form>
    </div>
  );
}

export default BookingForm;