import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ServiceList from "./components/ServiceList";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/services" element={<ServiceList />} />
    </Routes>
  );
}

export default App;