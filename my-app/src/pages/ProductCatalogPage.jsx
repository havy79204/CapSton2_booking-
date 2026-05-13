import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoCartOutline, IoSearchOutline, IoStar } from 'react-icons/io5';
import { useProducts } from '../hooks/useHomepage';
import { useCustomerCart } from '../hooks/useCustomerCommerce';
import PortalModal from '../components/Layout portal/PortalModal.jsx';
import { formatVnd } from '../lib/currency';
import '../styles/CatalogPage.css';

const ProductCatalogPage = () => {
  const CARDS_PER_PAGE = 12;
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [cartMessage, setCartMessage] = useState('');

  const { products: apiProducts, loading, error } = useProducts({
    sortBy:
      sortBy === 'price_asc' || sortBy === 'price_desc'
        ? 'price'
        : sortBy,
    sortOrder: sortBy === 'price_asc' ? 'asc' : 'desc',
  });
  const { addItem, updateItem, cart, busy: cartBusy } = useCustomerCart();

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

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / CARDS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * CARDS_PER_PAGE;
    return filteredProducts.slice(start, start + CARDS_PER_PAGE);
  }, [filteredProducts, safeCurrentPage]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSortBy('newest');
    setCurrentPage(1);
  };

  const handleAddToCart = async (productId) => {
    try {
      const product = products.find((p) => String(p.ProductId) === String(productId));
      const productName = String(product?.Name || '').trim();
      const stock = Number(product?.Stock || 0);

      if (!productId) {
        setCartMessage('Cannot add to cart: missing product id.');
        setCartModalOpen(true);
        return;
      }

      if (stock <= 0) {
        setCartMessage('Product is out of stock.');
        setCartModalOpen(true);
        return;
      }

      const existingItem = cart?.Items?.find((item) => String(item.ProductId) === String(productId));
      if (existingItem) {
        const currentQty = Number(existingItem.Quantity || 0);
        const maxStock = Number(existingItem.Stock || stock);
        if (currentQty >= maxStock) {
          setCartMessage(`Cannot add more. Maximum quantity (${maxStock}) already in cart.`);
          setCartModalOpen(true);
          return;
        }

        await updateItem(existingItem.CartItemId, { quantity: currentQty + 1 });
        setCartMessage(productName
          ? `Added 1 ${productName}. Quantity in cart: ${currentQty + 1}.`
          : `Quantity in cart updated to ${currentQty + 1}.`);
        setCartModalOpen(true);
        return;
      }

      await addItem({ productId, quantity: 1 });
      setCartMessage(productName ? `Added 1 ${productName} to cart!` : 'Added to cart!');
      setCartModalOpen(true);
    } catch (err) {
      setCartMessage(err?.message || 'Failed to add to cart');
      setCartModalOpen(true);
    }
  };

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
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(event) => {
              setSelectedCategory(event.target.value)
              setCurrentPage(1)
            }}
            className="catalog-select"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category.CategoryId} value={category.CategoryId}>
                {category.Name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value)
              setCurrentPage(1)
            }}
            className="catalog-select"
          >
            <option value="newest">Newest</option>
            <option value="best_selling">Best Selling</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>

          <button type="button" className="catalog-clear-btn" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="catalog-grid products-grid-page">
          {paginatedProducts.map((product) => (
            <div key={product.ProductId} className="catalog-card">
              <Link
                to={`/product/${product.ProductId}`}
                state={{ product }}
                className="catalog-link"
              >
                <div className="catalog-image">
                  {product.ImageUrl ? <img src={product.ImageUrl} alt={product.Name} /> : <div className="service-image-placeholder" />}
                  {product.Stock === 0 && <span className="catalog-out-badge">Out of Stock</span>}
                </div>
                <div className="catalog-content">
                  <h3>{product.Name}</h3>
                  <p>{product.Description}</p>
                  <div className="catalog-meta">
                    <span className="catalog-price">{formatVnd(product.DisplayPrice ?? product.Price ?? 0)}</span>
                    <span className="catalog-stock">{product.Stock} in stock</span>
                  </div>
                  <div className="catalog-stat-row">
                    <span className="catalog-stat">
                      <IoStar /> {Number(product.AverageRating || 0).toFixed(1)} ({Number(product.ReviewCount || 0)})
                    </span>
                    <span className="catalog-stat">{Number(product.SoldCount || 0)} sold</span>
                  </div>
                </div>
              </Link>
              <button
                type="button"
                className="catalog-action-btn"
                onClick={() => handleAddToCart(product.ProductId)}
                disabled={Number(product.Stock || 0) <= 0 || cartBusy}
              >
                <IoCartOutline /> {Number(product.Stock || 0) > 0 ? 'Add to Cart' : 'Out of Stock'}
              </button>
            </div>
          ))}
        </div>

        {filteredProducts.length > 0 && (
          <div className="catalog-pagination" role="navigation" aria-label="Products pagination">
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

        {filteredProducts.length === 0 && <p className="catalog-empty">No products found.</p>}

        <PortalModal
          open={cartModalOpen}
          title={cartMessage.toLowerCase().includes('failed') || cartMessage.toLowerCase().includes('cannot') ? 'Notice' : 'Added to Cart'}
          onClose={() => setCartModalOpen(false)}
        >
          <p>{cartMessage}</p>
        </PortalModal>
      </div>
    </section>
  );
};

export default ProductCatalogPage;