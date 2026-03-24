import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoSearchOutline } from 'react-icons/io5';
import { useProducts } from '../hooks/useHomepage';
import '../styles/CatalogPage.css';

const ProductCatalogPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { products: apiProducts, loading, error } = useProducts();

  const products = useMemo(() => (Array.isArray(apiProducts) ? apiProducts : []), [apiProducts]);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const product of products) {
      const categoryId = String(product.CategoryId ?? '');
      if (!categoryId || seen.has(categoryId)) continue;
      seen.set(categoryId, {
        CategoryId: categoryId,
        Name: product.CategoryName || 'Uncategorized',
      });
    }
    return Array.from(seen.values());
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const status = String(product?.Status || product?.status || '').trim().toLowerCase()
      const isActive = status === '' || status === 'active'
      if (!isActive) return false
      const matchesSearch =
        String(product.Name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(product.Description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || String(product.CategoryId) === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  if (loading) {
    return <div className="loading">Loading products...</div>;
  }

  if (error) {
    return <div className="error">Error loading products: {error}</div>;
  }

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
            {categories.map((category) => (
              <option key={category.CategoryId} value={category.CategoryId}>
                {category.Name}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-grid products-grid-page">
          {filteredProducts.map((product) => (
            <Link
              key={product.ProductId}
              to={`/product/${product.ProductId}`}
              state={{ product }}
              className="catalog-card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="catalog-image">
                {product.ImageUrl ? <img src={product.ImageUrl} alt={product.Name} /> : <div className="service-image-placeholder" />}
                {product.Stock === 0 && <span className="catalog-out-badge">Out of Stock</span>}
              </div>
              <div className="catalog-content">
                <h3>{product.Name}</h3>
                <p>{product.Description}</p>
                <div className="catalog-meta">
                  <span className="catalog-price">${Number(product.Price || 0).toFixed(2)}</span>
                  <span className="catalog-stock">{product.Stock} in stock</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filteredProducts.length === 0 && <p className="catalog-empty">No products found.</p>}
      </div>
    </section>
  );
};

export default ProductCatalogPage;