import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoSearchOutline } from 'react-icons/io5';
import { useServices } from '../hooks/useHomepage';
import axios from 'axios';
import '../styles/CatalogPage.css';

const ServiceCatalogPage = () => {
  const navigate = useNavigate();
  const { services, loading, error } = useServices();

  // 🔍 search theo tên
  const [searchTerm, setSearchTerm] = useState('');

  // 📌 category đã chọn
  const [selectedCategory, setSelectedCategory] = useState('all');

  // 🔥 autocomplete
  const [categorySearch, setCategorySearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 🚀 API SEARCH (đã fix chuẩn)
  let timeout;
  const handleCategorySearch = (value) => {
    setCategorySearch(value);

    clearTimeout(timeout);

    timeout = setTimeout(async () => {
      if (value.trim().length > 1) {
        try {
          const res = await axios.get(
            `http://localhost:5000/api/services/categories/search?q=${encodeURIComponent(value)}`
          );

          // ✅ backend trả array trực tiếp
          setSuggestions(res.data);
          setShowSuggestions(true);

        } catch (err) {
          console.error("Lỗi tìm danh mục:", err);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
  };

  // 📦 xử lý danh sách
  const serviceList = useMemo(
    () => (Array.isArray(services) ? services : []),
    [services]
  );

  // 🎯 filter
  const filteredServices = useMemo(() => {
    return serviceList.filter((service) => {
      const matchesSearch =
        String(service.Name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(service.Description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' ||
        String(service.CategoryId) === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory, serviceList]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <section className="catalog-page">
      <div className="catalog-container">

        {/* HEADER */}
        <div className="catalog-head">
          <button onClick={() => navigate(-1)}>
            <IoArrowBack /> Back
          </button>
          <h1>All Services</h1>
        </div>

        {/* FILTER */}
        <div className="catalog-filter-bar">

          {/* 🔍 search tên */}
          <div className="catalog-search-box">
            <IoSearchOutline />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 🔥 AUTOCOMPLETE */}
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="Enter service category..."
              value={categorySearch}
              onChange={(e) => handleCategorySearch(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />

            {/* DROPDOWN */}
            {showSuggestions && suggestions.length > 0 && (
              <ul style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'white',
                border: '1px solid #ccc',
                zIndex: 1000,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                {suggestions.map((item) => (
                  <li
                    key={item.CategoryId}
                    onClick={() => {
                      setCategorySearch(item.Name);
                      setSelectedCategory(String(item.CategoryId));
                      setShowSuggestions(false);
                    }}
                    style={{
                      padding: '10px',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.background = 'white'}
                  >
                    {item.Name}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* LIST */}
        <div className="catalog-grid">
          {filteredServices.map((service) => (
            <div key={service.ServiceId} className="catalog-card">
              <Link to={`/service/${service.ServiceId}`} state={{ service }}>
                <h3>{service.Name}</h3>
                <p>{service.Description}</p>
                <p>${Number(service.Price || 0).toFixed(2)}</p>
              </Link>
            </div>
          ))}
        </div>

        {/* EMPTY */}
        {filteredServices.length === 0 && (
          <p>No services found.</p>
        )}

      </div>
    </section>
  );
};

export default ServiceCatalogPage;