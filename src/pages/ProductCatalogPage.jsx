import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoArrowBack, IoSearchOutline } from 'react-icons/io5';
import { mockProducts, mockProductCategories } from '../lib/mockData';
import '../styles/CatalogPage.css';

const ProductCatalogPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredProducts = useMemo(() => {
    return mockProducts.filter((product) => {
      const matchesSearch =
        product.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.Description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || product.CategoryId === selectedCategory;

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
          <h1>All Products</h1>
        </div>

        <div className="catalog-filter-bar">
          <div className="catalog-search-box">
            <IoSearchOutline />
            <input
              type="text"
              placeholder="Search products..."
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
            {mockProductCategories.map((category) => (
              <option key={category.CategoryId} value={category.CategoryId}>
                {category.Name}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-grid products-grid-page">
          {filteredProducts.map((product) => (
            <div
              key={product.ProductId}
              className="catalog-card"
              onClick={() => navigate(`/product/${product.ProductId}`)}
            >
              <div className="catalog-image">
                <img src={product.ImageUrl} alt={product.Name} />
                {product.Stock === 0 && <span className="catalog-out-badge">Out of Stock</span>}
              </div>
              <div className="catalog-content">
                <h3>{product.Name}</h3>
                <p>{product.Description}</p>
                <div className="catalog-meta">
                  <span className="catalog-price">${product.Price.toFixed(2)}</span>
                  <span className="catalog-stock">{product.Stock} in stock</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && <p className="catalog-empty">No products found.</p>}
      </div>
    </section>
  );
};

export default ProductCatalogPage;