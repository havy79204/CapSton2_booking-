import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Services from "./pages/Services";
import ServiceList from "./components/ServiceList";
import BookingForm from "./components/BookingForm";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Trang chính */}
        <Route path="/" element={<Home />} />

        {/* Trang services */}
        <Route path="/services" element={<Services />} />

        {/* Danh sách dịch vụ */}
        <Route path="/service-list" element={<ServiceList />} />

        {/* Trang đặt lịch */}
        <Route path="/book/:id" element={<BookingForm />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;