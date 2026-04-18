import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IoArrowBack,
  IoSearchOutline,
} from 'react-icons/io5';
import { formatVnd } from '../lib/currency'
import { useServiceCategories, useServices } from '../hooks/useHomepage';
import '../styles/CatalogPage.css';

const ServiceCatalogPage = () => {
  const CARDS_PER_PAGE = 12;
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceSort, setPriceSort] = useState('price_asc');
  const [currentPage, setCurrentPage] = useState(1);

  const { services, loading, error } = useServices({
    categoryId: selectedCategory,
    sortBy: 'price',
    sortOrder: priceSort === 'price_desc' ? 'desc' : 'asc',
  });
  const { categories } = useServiceCategories();

  // 🔍 search theo tên
  const [searchTerm, setSearchTerm] = useState('');

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
      return matchesSearch;
    });
  }, [searchTerm, serviceList]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / CARDS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedServices = useMemo(() => {
    const start = (safeCurrentPage - 1) * CARDS_PER_PAGE;
    return filteredServices.slice(start, start + CARDS_PER_PAGE);
  }, [filteredServices, safeCurrentPage]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setPriceSort('price_asc');
    setCurrentPage(1);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <section className="catalog-page">
      <div className="catalog-container">

        {/* HEADER */}
        <div className="catalog-head">
          <button className="catalog-back-btn" onClick={() => navigate(-1)}>
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
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>

          <select
            className="catalog-select"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value)
              setCurrentPage(1)
            }}
          >
            <option value="all">Category: All</option>
            {(Array.isArray(categories) ? categories : []).map((item) => (
              <option key={item.CategoryId} value={String(item.CategoryId)}>{item.Name}</option>
            ))}
          </select>

          <select
            className="catalog-select"
            value={priceSort}
            onChange={(e) => {
              setPriceSort(e.target.value)
              setCurrentPage(1)
            }}
          >
            <option value="price_asc">Price: Low to high</option>
            <option value="price_desc">Price: High to low</option>
          </select>

          <button className="catalog-clear-btn" onClick={clearFilters} type="button">
            Clear Filters
          </button>

        </div>

        {/* LIST */}
        <div className="catalog-grid services-grid-page">
          {paginatedServices.map((service) => (
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
                    <span className="catalog-price">{formatVnd(service.Price || 0)}</span>
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

        {filteredServices.length > 0 && (
          <div className="catalog-pagination" role="navigation" aria-label="Services pagination">
            <button
              type="button"
              className="catalog-page-btn"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={safeCurrentPage === 1}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={`catalog-page-btn ${pageNumber === safeCurrentPage ? 'active' : ''}`}
                onClick={() => setCurrentPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              className="catalog-page-btn"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}

        {/* EMPTY */}
        {filteredServices.length === 0 && (
          <p className="catalog-empty">No services found with current filters.</p>
        )}

      </div>
    </section>
  );
};

export default ServiceCatalogPage;