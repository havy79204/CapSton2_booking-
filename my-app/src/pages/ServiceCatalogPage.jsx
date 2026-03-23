import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoSearchOutline } from 'react-icons/io5';
import { useServices } from '../hooks/useHomepage';
import '../styles/CatalogPage.css';

const ServiceCatalogPage = () => {
  const navigate = useNavigate();
  const { services, loading, error } = useServices();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const serviceList = useMemo(() => (Array.isArray(services) ? services : []), [services]);

  const serviceCategories = useMemo(() => {
    const byId = new Map();

    serviceList.forEach((service) => {
      const key = String(service.CategoryId || '');
      if (!key || byId.has(key)) return;
      byId.set(key, {
        CategoryId: key,
        Name: service.CategoryName || `Category ${key}`,
      });
    });

    return Array.from(byId.values()).sort((a, b) => a.Name.localeCompare(b.Name));
  }, [serviceList]);

  const filteredServices = useMemo(() => {
    return serviceList.filter((service) => {
      const matchesSearch =
        String(service.Name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(service.Description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || String(service.CategoryId) === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory, serviceList]);

  if (loading) {
    return <div className="loading">Loading services...</div>;
  }

  if (error) {
    return <div className="error">Error loading services: {error}</div>;
  }

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
            {serviceCategories.map((category) => (
              <option key={category.CategoryId} value={category.CategoryId}>
                {category.Name}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-grid services-grid-page">
          {filteredServices.map((service) => (
            <div key={service.ServiceId} className="catalog-card">
              <Link 
                to={`/service/${service.ServiceId}`}
                state={{ service }}
                className="catalog-link"
              >
                <div className="catalog-image">
                  {service.ImageUrl ? (
                    <img src={service.ImageUrl} alt={service.Name} />
                  ) : (
                    <div className="service-image-placeholder"></div>
                  )}
                </div>
                <div className="catalog-content">
                  <h3>{service.Name}</h3>
                  <p>{service.Description}</p>
                  <div className="catalog-meta">
                    <span className="catalog-price">${Number(service.Price || 0).toFixed(2)}</span>
                    <span className="catalog-duration">{service.DurationMinutes} min</span>
                  </div>
                </div>
              </Link>
              <Link
                to="/booking"
                state={{ serviceId: service.ServiceId }}
                className="catalog-action-btn"
              >
                Book Now
              </Link>
            </div>
          ))}
        </div>

        {filteredServices.length === 0 && <p className="catalog-empty">No services found.</p>}
      </div>
    </section>
  );
};

export default ServiceCatalogPage;