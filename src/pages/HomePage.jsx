import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { salonStats, mockReviews, mockServices, mockProducts, mockHomePageFeatures } from '../lib/mockData';

import '../styles/HomePage.css';

const HeroSection = () => {
  const navigate = useNavigate();

  const goToServicesCatalog = () => {
    navigate('/services');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToShopCatalog = () => {
    navigate('/shop');
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
          <button className="hero-btn primary" onClick={goToServicesCatalog}>View Services</button>
          <button className="hero-btn secondary" onClick={goToShopCatalog}>Shop Now</button>
        </div>
      </div>
    </section>
  );
};

const ServicesSection = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllServices, setShowAllServices] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        
        setServices(mockServices);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching services:', error);
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  const handleBookService = (serviceId) => {
    navigate('/booking', { state: { serviceId } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return <div className="loading">Loading services...</div>;
  }

  const displayedServices = showAllServices ? services : services.slice(0, 5);
  const hasMoreServices = services.length > 5;

  return (
    <section className="services" id="salons">
      <div className="services-container">
        <h2 className="section-title">Our Services</h2>
        
        <div className="services-grid">
          {displayedServices.map((service) => (
            <div key={service.ServiceId} className="service-card">
              <Link to={`/service/${service.ServiceId}`} className="service-link">
                <div className="service-image">
                  <img src={service.ImageUrl} alt={service.Name} />
                </div>
                <div className="service-content">
                  <h3>{service.Name}</h3>
                  <p>{service.Description}</p>
                  <div className="service-details">
                    <span className="price">${service.Price.toFixed(2)}</span>
                    <span className="duration">{service.DurationMinutes} min</span>
                  </div>
                </div>
              </Link>
              <div className="service-actions">
                <button 
                  className="book-btn"
                  onClick={() => handleBookService(service.ServiceId)}
                >
                  Book Now
                </button>
              </div>
            </div>
          ))}
        </div>

        {hasMoreServices && (
          <div className="view-more-container">
            <button 
              className="view-more-btn"
              onClick={() => setShowAllServices(!showAllServices)}
            >
              {showAllServices ? 'Show Less Services' : 'View More Services'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

const ProductsSection = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllProducts, setShowAllProducts] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        
        setProducts(mockProducts);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching products:', error);
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleAddToCart = (productId) => {
    console.log('Adding product to cart:', productId);
  };

  const filteredProducts = products;

  if (loading) {
    return <div className="loading">Loading products...</div>;
  }

  const displayedProducts = showAllProducts ? filteredProducts : filteredProducts.slice(0, 5);
  const hasMoreProducts = filteredProducts.length > 5;

  return (
    <section className="products" id="shop">
      <div className="products-container">
        <h2 className="section-title">Our Products</h2>

        <div className="products-grid">
          {displayedProducts.map((product) => (
            <div 
              key={product.ProductId} 
              className="product-card"
              onClick={() => navigate(`/product/${product.ProductId}`)}
            >
              <div className="product-image">
                <img src={product.ImageUrl} alt={product.Name} />
                {product.Stock === 0 && (
                  <span className="out-of-stock-badge">Out of Stock</span>
                )}
              </div>
              <div className="product-content">
                <h3>{product.Name}</h3>
                <p>{product.Description}</p>
                <div className="product-footer">
                  <span className="price">${product.Price.toFixed(2)}</span>
                  <span className="product-stock">{product.Stock} in stock</span>
                </div>
                <button 
                  className="add-to-cart-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart(product.ProductId);
                  }}
                  disabled={product.Stock === 0}
                >
                  {product.Stock > 0 ? 'Add to Cart' : 'Out of Stock'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {hasMoreProducts && (
          <div className="view-more-container">
            <button 
              className="view-more-btn"
              onClick={() => setShowAllProducts(!showAllProducts)}
            >
              {showAllProducts ? 'Show Less Products' : 'View More Products'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

const WhyChooseUsSection = () => {
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

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      setAnimatedStats({
        orders: Math.floor(salonStats.TotalOrders * progress),
        bookings: Math.floor(salonStats.TotalBookings * progress),
        rating: (salonStats.AverageRating * progress).toFixed(1),
        customers: Math.floor(salonStats.HappyCustomers * progress)
      });

      if (currentStep >= steps) {
        clearInterval(timer);
        setAnimatedStats({
          orders: salonStats.TotalOrders,
          bookings: salonStats.TotalBookings,
          rating: salonStats.AverageRating,
          customers: salonStats.HappyCustomers
        });
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="why-choose-us" id="why-us">
      <div className="why-choose-container">
        <h2 className="section-title">Why Choose Us?</h2>
        <p className="section-subtitle">
          Committed to bringing the best shopping experience with professional service and quality products
        </p>

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
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [reviewsPerSlide, setReviewsPerSlide] = useState(2);

  const sortedReviews = [...mockReviews].sort((a, b) => {
    if (b.Rating !== a.Rating) {
      return b.Rating - a.Rating;
    }
    return new Date(b.CreatedAt) - new Date(a.CreatedAt);
  });

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
                              <img src={review.Avatar} alt={review.CustomerName} />
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
      <WhyChooseUsSection />
      <ReviewsSection />
      <ChatWidget />
    </>
  );
};

export default HomePage;
