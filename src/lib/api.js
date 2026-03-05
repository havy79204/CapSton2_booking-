import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

// Salons API
export const getSalons = async () => {
  const res = await api.get("/salons");
  return res.data;
};

// Services API
export const getServices = async (salonId) => {
  const res = await api.get(`/services/salon/${salonId}`);
  return res.data;
};

// Bookings API
export const createBooking = async (bookingData) => {
  const res = await api.post("/bookings", bookingData);
  return res.data;
};

export const getBookings = async () => {
  const res = await api.get("/bookings");
  return res.data;
};

export default api;