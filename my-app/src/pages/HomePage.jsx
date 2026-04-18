import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  IoShieldCheckmarkOutline, 
  IoHeadsetOutline, 
  IoCardOutline, 
  IoSyncOutline, 
  IoStar, 
  IoStarHalf,
  IoStarOutline,
  IoPeople, 
  IoCart, 
  IoCalendar 
} from 'react-icons/io5';
import ChatWidget from '../components/ChatWidget';
import PortalModal from '../components/Layout portal/PortalModal.jsx';
import { useServices, useProducts, useReviews, useSalonStats } from '../hooks/useHomepage';
import { useCustomerCart } from '../hooks/useCustomerCommerce';
import { formatVnd } from '../lib/currency';

import '../styles/HomePage.css';

const INITIAL_PREVIEW_ITEMS = 4;
const PREVIEW_STEP = 4;
const PREVIEW_BEFORE_ALL = 12;

const FEATURED_MARKERS = ['featured', 'hot', 'popular', 'best'];

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasFeaturedFlag(item) {
  if (!item || typeof item !== 'object') return false;

  const rawFlag =
    item.IsFeatured ??
    item.isFeatured ??
    item.Featured ??
    item.featured ??
    item.IsHot ??
    item.isHot;

  if (rawFlag === true || rawFlag === 1 || rawFlag === '1') return true;
  if (typeof rawFlag === 'string') {
    const normalized = rawFlag.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'featured') {
      return true;
    }
  }

  const tagCandidates = [item.Tag, item.Tags, item.Badge, item.Label, item.CategoryName]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase());

  return tagCandidates.some((value) => FEATURED_MARKERS.some((keyword) => value.includes(keyword)));
}

function rankFeaturedItems(list = [], type = 'product') {
  const source = Array.isArray(list) ? list : [];

  return [...source].sort((a, b) => {
    const aFeatured = hasFeaturedFlag(a) ? 1 : 0;
    const bFeatured = hasFeaturedFlag(b) ? 1 : 0;
    if (aFeatured !== bFeatured) return bFeatured - aFeatured;

    const aPopularity = Math.max(
      toFiniteNumber(a.Popularity),
      toFiniteNumber(a.SoldCount),
      toFiniteNumber(a.BookingCount)
    );
    const bPopularity = Math.max(
      toFiniteNumber(b.Popularity),
      toFiniteNumber(b.SoldCount),
      toFiniteNumber(b.BookingCount)
    );
    if (aPopularity !== bPopularity) return bPopularity - aPopularity;

    const aRating = toFiniteNumber(a.AverageRating ?? a.AvgRating);
    const bRating = toFiniteNumber(b.AverageRating ?? b.AvgRating);
    if (aRating !== bRating) return bRating - aRating;

    const aReviewCount = toFiniteNumber(a.ReviewCount);
    const bReviewCount = toFiniteNumber(b.ReviewCount);
    if (aReviewCount !== bReviewCount) return bReviewCount - aReviewCount;

    const aStock = toFiniteNumber(a.Stock);
    const bStock = toFiniteNumber(b.Stock);
    if (type === 'product' && aStock !== bStock) return bStock - aStock;

    return String(a?.Name || '').localeCompare(String(b?.Name || ''));
  });
}

const HeroSection = () => {
  const handleNavigation = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="hero">
      <div className="hero-content">
        <h1 className="hero-title">NIOM&CE</h1>
        <p className="hero-subtitle">
          Experience Luxury Nail Care & Premium Beauty Products<br />
          Where Elegance Meets Excellence
        </p>
        <div className="hero-buttons">
          <Link to="/services" className="hero-btn primary" onClick={handleNavigation}>View Services</Link>
          <Link to="/shop" className="hero-btn secondary" onClick={handleNavigation}>Shop Now</Link>
        </div>
      </div>
    </section>
  );
};

const ServicesSection = () => {
  const { services: apiServices, loading, error } = useServices();
  const [visibleServicesCount, setVisibleServicesCount] = useState(INITIAL_PREVIEW_ITEMS);
  const services = useMemo(() => rankFeaturedItems(apiServices, 'service'), [apiServices]);

  if (loading) {
    return <div className="loading">Loading services...</div>;
  }

  if (error) {
    return <div className="error">Error loading services: {error}</div>;
  }

  if (!services || services.length === 0) {
    return <div className="loading">No services available</div>;
  }

  const displayedServices = services.slice(0, visibleServicesCount);
  const hasMoreServices = visibleServicesCount < services.length;

  const showMoreServices = () => {
    setVisibleServicesCount((current) => {
      if (current >= services.length) return current;
      if (current < PREVIEW_BEFORE_ALL) {
        return Math.min(current + PREVIEW_STEP, services.length);
      }
      return services.length;
    });
  };

  return (
    <section className="services" id="salons">
      <div className="services-container">
        <h2 className="section-title">Our Services</h2>
        
        <div className="services-grid">
          {displayedServices.map((service) => (
            <div key={service.ServiceId} className="service-card">
              <Link 
                to={`/service/${service.ServiceId}`}
                state={{ service }}
                className="service-link"
              >
                <div className="service-image">
                  {service.ImageUrl ? <img src={service.ImageUrl} alt={service.Name} /> : <div className="service-image-placeholder"></div>}
                </div>
                <div className="service-content">
                  <h3>{service.Name}</h3>
                  <p>{service.Description}</p>
                  <div className="service-details">
                    <span className="price">{formatVnd(service.Price || 0)}</span>
                    <span className="duration">{service.DurationMinutes} min</span>
                  </div>
                </div>
              </Link>
              <Link
                to="/booking"
                state={{ serviceId: service.ServiceId }}
                className="book-btn"
              >
                Book Now
              </Link>
            </div>
          ))}
        </div>

        {hasMoreServices && (
          <div className="view-more-container">
            {visibleServicesCount >= PREVIEW_BEFORE_ALL ? (
              <Link to="/services" className="view-more-btn">
                Show All Services
              </Link>
            ) : (
              <button className="view-more-btn" onClick={showMoreServices}>
                Show More Services
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const ProductsSection = () => {
  const { products: apiProducts, loading, error } = useProducts();
  const { addItem, updateItem, cart, busy: cartBusy } = useCustomerCart();
  const [visibleProductsCount, setVisibleProductsCount] = useState(INITIAL_PREVIEW_ITEMS);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [cartMessage, setCartMessage] = useState('');
  const products = useMemo(() => rankFeaturedItems(apiProducts, 'product'), [apiProducts]);

  const handleAddToCart = async (productId) => {
    try {
      const product = products.find((p) => String(p.ProductId) === String(productId));
      const productName = String(product?.Name || '').trim();

      // Check if product already exists in cart
      const existingItem = cart?.Items?.find(item => String(item.ProductId) === String(productId));
      
      if (existingItem) {
        // Product already in cart - update its quantity instead
        const currentQty = Number(existingItem.Quantity || 0);
        const maxStock = Number(existingItem.Stock || 0);
        
        if (currentQty >= maxStock) {
          setCartMessage(`Cannot add more - maximum quantity (${maxStock}) already in cart`);
          setCartModalOpen(true);
          return;
        }
        
        await updateItem(existingItem.CartItemId, { quantity: currentQty + 1 });
        setCartMessage(
          productName
            ? `Added 1 ${productName}. Quantity in cart: ${currentQty + 1}.`
            : `Added 1 item. Quantity in cart: ${currentQty + 1}.`
        );
        setCartModalOpen(true);
      } else {
        // Product not in cart - add it with quantity 1
        await addItem({ productId, quantity: 1 });
        setCartMessage(
          productName
            ? `Added 1 ${productName} to cart!`
            : 'Added 1 item to cart!'
        );
        setCartModalOpen(true);
      }
    } catch (err) {
      const errorMsg = err?.message || 'Failed to add to cart';
      setCartMessage(errorMsg);
      setCartModalOpen(true);
    }
  };

  if (loading) {
    return <div className="loading">Loading products...</div>;
  }

  if (error) {
    return <div className="error">Error loading products: {error}</div>;
  }

  if (!products || products.length === 0) {
    return <div className="loading">No products available</div>;
  }

  const filteredProducts = products;
  const displayedProducts = filteredProducts.slice(0, visibleProductsCount);
  const hasMoreProducts = visibleProductsCount < filteredProducts.length;

  const showMoreProducts = () => {
    setVisibleProductsCount((current) => {
      if (current >= filteredProducts.length) return current;
      if (current < PREVIEW_BEFORE_ALL) {
        return Math.min(current + PREVIEW_STEP, filteredProducts.length);
      }
      return filteredProducts.length;
    });
  };

  return (
    <section className="products" id="shop">
      <div className="products-container">
        <h2 className="section-title">Our Products</h2>

        <div className="products-grid">
          {displayedProducts.map((product) => (
            <div key={product.ProductId} className="product-card">
              <Link 
                to={`/product/${product.ProductId}`}
                state={{ product }}
                className="product-card-link"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="product-image">
                  {product.ImageUrl ? (
                    <img src={product.ImageUrl} alt={product.Name} />
                  ) : (
                    <div className="service-image-placeholder"></div>
                  )}
                  {product.Stock === 0 && (
                    <span className="out-of-stock-badge">Out of Stock</span>
                  )}
                </div>
                <div className="product-content">
                  <h3>{product.Name}</h3>
                  <p>{product.Description}</p>
                  <div className="product-footer">
                    <span className="price">{formatVnd(product.Price || 0)}</span>
                    <span className="product-stock">{product.Stock} in stock</span>
                  </div>
                </div>
              </Link>
              <button 
                className="add-to-cart-btn"
                onClick={() => handleAddToCart(product.ProductId)}
                disabled={product.Stock === 0 || cartBusy}
              >
                {product.Stock > 0 ? 'Add to Cart' : 'Out of Stock'}
              </button>
            </div>
          ))}
        </div>

        {hasMoreProducts && (
          <div className="view-more-container">
            {visibleProductsCount >= PREVIEW_BEFORE_ALL ? (
              <Link to="/shop" className="view-more-btn">
                Show All Products
              </Link>
            ) : (
              <button className="view-more-btn" onClick={showMoreProducts}>
                Show More Products
              </button>
            )}
          </div>
        )}
      </div>

      <PortalModal
        open={cartModalOpen}
        title={cartMessage.includes('Failed') || cartMessage.includes('Cannot') ? 'Notice' : 'Added to Cart'}
        onClose={() => setCartModalOpen(false)}
      >
        <p style={{ 
          fontSize: '15px', 
          color: '#1f2937', 
          marginBottom: '12px', 
          lineHeight: '1.6',
          fontWeight: '500'
        }}>
          {cartMessage}
        </p>
      </PortalModal>
    </section>
  );
};

const WhyCooseUsSection = () => {
  const { stats: apiStats, loading } = useSalonStats();
  const featureIcons = {
    shield: IoShieldCheckmarkOutline,
    headset: IoHeadsetOutline,
    card: IoCardOutline,
    sync: IoSyncOutline
  };

  const [animatedStats, setAnimatedStats] = useState({
    orders: 0,
    bookings: 0,
    rating: 0,
    customers: 0
  });

  const mockHomePageFeatures = [
    {
      id: 1,
      title: 'Quality Guaranteed',
      description: 'Carefully selected from leading beauty brands',
      iconKey: 'shield'
    },
    {
      id: 2,
      title: 'Professional Consultation',
      description: 'Expert team with product knowledge, 24/7 customer support',
      iconKey: 'headset'
    },
    {
      id: 3,
      title: 'Diverse Payment',
      description: 'Absolute security, COD support, online payment',
      iconKey: 'card'
    },
    {
      id: 4,
      title: 'Flexible Returns',
      description: 'Easy return support within 7 days',
      iconKey: 'sync'
    }
  ];

  useEffect(() => {
    if (!apiStats) return;

    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      setAnimatedStats({
        orders: Math.floor(apiStats.TotalOrders * progress),
        bookings: Math.floor(apiStats.TotalBookings * progress),
        rating: (apiStats.AverageRating * progress).toFixed(1),
        customers: Math.floor(apiStats.HappyCustomers * progress)
      });

      if (currentStep >= steps) {
        clearInterval(timer);
        setAnimatedStats({
          orders: apiStats.TotalOrders,
          bookings: apiStats.TotalBookings,
          rating: apiStats.AverageRating,
          customers: apiStats.HappyCustomers
        });
      }
    }, interval);

    return () => clearInterval(timer);
  }, [apiStats]);

  return (
    <section className="why-choose-us" id="why-us">
      <div className="why-choose-container">
        <h2 className="section-title">Why Coose Us?</h2>
        <p className="section-subtitle">
          Committed to bringing the best shopping experience with professional service and quality products
        </p>

        {!loading && apiStats && (
        <div className="stats-container">
          <div className="stat-item">
            <div className="stat-icon">
              <IoCart />
            </div>
            <div className="stat-content">
              <h3 className="stat-number">{animatedStats.orders.toLocaleString()}+</h3>
              <p className="stat-label">Total Orders</p>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">
              <IoCalendar />
            </div>
            <div className="stat-content">
              <h3 className="stat-number">{animatedStats.bookings.toLocaleString()}+</h3>
              <p className="stat-label">Bookings Completed</p>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">
              <IoStar />
            </div>
            <div className="stat-content">
              <h3 className="stat-number">{animatedStats.rating}</h3>
              <p className="stat-label">Average Rating</p>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">
              <IoPeople />
            </div>
            <div className="stat-content">
              <h3 className="stat-number">{animatedStats.customers.toLocaleString()}+</h3>
              <p className="stat-label">Happy Customers</p>
            </div>
          </div>
        </div>
        )}

        <div className="features-grid">
          {mockHomePageFeatures.map((feature) => {
            const IconComponent = featureIcons[feature.iconKey];
            return (
              <div key={feature.id} className="feature-card">
                <div className="feature-icon">
                  <IconComponent />
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const ReviewsSection = () => {
  const { reviews: apiReviews, loading } = useReviews(10);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [reviewsPerSlide, setReviewsPerSlide] = useState(2);
  const sortedReviews = useMemo(() => {
    if (!Array.isArray(apiReviews)) {
      return [];
    }

    return [...apiReviews].sort((a, b) => {
      if (b.Rating !== a.Rating) {
        return b.Rating - a.Rating;
      }
      return new Date(b.CreatedAt) - new Date(a.CreatedAt);
    });
  }, [apiReviews]);

  const totalReviews = sortedReviews.length;
  const totalSlides = Math.ceil(totalReviews / reviewsPerSlide);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setReviewsPerSlide(4);
      } else {
        setReviewsPerSlide(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isAutoPlay) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlay, totalSlides]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlay(false);
  };
  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<IoStar key={`full-${i}`} className="star-icon filled" />);
    }
    
    if (hasHalfStar) {
      stars.push(<IoStarHalf key="half" className="star-icon filled" />);
    }
    
    const remainingStars = 5 - stars.length;
    for (let i = 0; i < remainingStars; i++) {
      stars.push(<IoStarOutline key={`empty-${i}`} className="star-icon" />);
    }
    
    return stars;
  };

  if (loading || sortedReviews.length === 0) {
    return <div className="loading">Loading reviews...</div>;
  }

  return (
    <section className="reviews-section" id="reviews">
      <div className="reviews-content">
        <div className="section-header">
          <h2 className="section-title">What Our Customers Say</h2>
          <p className="section-subtitle">Hear from our valued customers</p>
        </div>

        <div className="reviews-carousel-container">
          <div className="reviews-carousel">
            <div 
              className="reviews-track"
              style={{
                transform: `translateX(-${currentSlide * 100}%)`,
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => {
                const startIdx = slideIndex * reviewsPerSlide;
                const slideReviews = sortedReviews.slice(startIdx, startIdx + reviewsPerSlide);
                
                return (
                  <div key={slideIndex} className="reviews-slide">
                    {slideReviews.map((review) => (
                      <div key={review.ReviewId} className="review-card">
                        <div className="quote-mark">"</div>
                        <div className="review-body">
                          <p className="review-comment">{review.Comment}</p>
                        </div>
                        <div className="review-header">
                          <div className="customer-info">
                            <div className="customer-avatar">
                              <img src={review.Avatar ? `${review.Avatar}${String(review.Avatar).includes('?') ? '&' : '?'}v=${review._avatarVersion || 1}` : '/Profiles/1.jpg'} alt={review.CustomerName} />
                            </div>
                            <div className="customer-details">
                              <h4 className="customer-name">{review.CustomerName}</h4>
                              <div className="review-rating">
                                {renderStars(review.Rating)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="carousel-dots">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              className={`dot ${currentSlide === index ? 'active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const HomePage = () => {
  return (
    <>
      <HeroSection />
      <ServicesSection />
      <ProductsSection />
      <WhyCooseUsSection />
      <ReviewsSection />
      <ChatWidget />
    </>
  );
};

export default HomePage;
