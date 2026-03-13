import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoSearchOutline } from 'react-icons/io5';
import { mockServices, mockServiceCategories } from '../lib/mockData';
import '../styles/CatalogPage.css';

const ServiceCatalogPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredServices = useMemo(() => {
    return mockServices.filter((service) => {
      const matchesSearch =
        service.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.Description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || service.CategoryId === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <section className="catalog-page">
      <div className="catalog-container">
        <div className="catalog-head">
          <button className="catalog-back-btn" onClick={() => navigate(-1)}>
            <IoArrowBack /> Back
          </button>
          <h1>All Services</h1>
        </div>

        <div className="catalog-filter-bar">
          <div className="catalog-search-box">
            <IoSearchOutline />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="catalog-select"
          >
            <option value="all">All Categories</option>
            {mockServiceCategories.map((category) => (
              <option key={category.CategoryId} value={category.CategoryId}>
                {category.Name}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-grid services-grid-page">
          {filteredServices.map((service) => (
            <div key={service.ServiceId} className="catalog-card">
              <Link to={`/service/${service.ServiceId}`} className="catalog-link">
                <div className="catalog-image">
                  <img src={service.ImageUrl} alt={service.Name} />
                </div>
                <div className="catalog-content">
                  <h3>{service.Name}</h3>
                  <p>{service.Description}</p>
                  <div className="catalog-meta">
                    <span className="catalog-price">${service.Price.toFixed(2)}</span>
                    <span className="catalog-duration">{service.DurationMinutes} min</span>
                  </div>
                </div>
              </Link>
              <button
                className="catalog-action-btn"
                onClick={() => navigate('/booking', { state: { serviceId: service.ServiceId } })}
              >
                Book Now
              </button>
            </div>
          ))}
        </div>

        {filteredServices.length === 0 && <p className="catalog-empty">No services found.</p>}
      </div>
    </section>
  );
};

export default ServiceCatalogPage;