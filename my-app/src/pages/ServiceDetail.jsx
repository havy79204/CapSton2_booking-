import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  IoStar, 
  IoStarHalf, 
  IoStarOutline,
  IoTimeOutline,
  IoPricetagOutline,
  IoCheckmarkCircle,
  IoArrowBack
} from 'react-icons/io5';
import { resolveApiImageUrl } from '../lib/api.js';
import { useServiceReviews, useServices } from '../hooks/useHomepage';
import '../styles/ServiceDetail.css';

const ServiceDetailSection = ({ service, reviews }) => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);

  const galleryImages = useMemo(() => {
    const images = Array.isArray(service.Images)
      ? service.Images.map((img) => resolveApiImageUrl(img)).filter(Boolean)
      : [];
    if (images.length > 0) return images;
    const singleImage = resolveApiImageUrl(service.ImageUrl);
    if (singleImage) return [singleImage];
    return [];
  }, [service.Images, service.ImageUrl]);

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, review) => sum + review.Rating, 0) / reviews.length).toFixed(1)
    : 0;

  const bookingsCount = Number(service.BookingsCount || 0);

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<IoStar key={i} className="star-icon filled" />);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(<IoStarHalf key={i} className="star-icon filled" />);
      } else {
        stars.push(<IoStarOutline key={i} className="star-icon" />);
      }
    }
    
    return stars;
  };

  const handleBookService = () => {
    navigate('/booking', { state: { serviceId: service.ServiceId } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleThumbnailClick = (index) => {
    setSelectedImage(index);
  };

  return (
    <section className="service-detail-section">
      <div className="service-detail-container">
        <button className="back-btn" onClick={handleGoBack}>
          <IoArrowBack /> Back to Services
        </button>

        <div className="service-detail-content">
          <div className="service-detail-image-wrapper">
            <div className="service-detail-image">
              {galleryImages.length > 0 ? (
                <img src={galleryImages[selectedImage] || galleryImages[0]} alt={service.Name} />
              ) : (
                <div className="service-image-placeholder"></div>
              )}
              <div className="image-badge">
                <IoCheckmarkCircle /> Active Service
              </div>
            </div>

            <div className="image-gallery-thumbnails">
              {galleryImages.slice(0, 3).map((img, index) => (
                <div
                  key={index}
                  className={`thumbnail-item ${selectedImage === index ? 'active' : ''} ${index === 2 ? 'has-more' : ''}`}
                  onClick={() => handleThumbnailClick(index)}
                >
                  <img src={img} alt={`${service.Name} ${index + 1}`} />
                  {index === 2 && galleryImages.length > 3 && (
                    <div className="thumbnail-overlay">
                      <span className="more-count">+{galleryImages.length - 3}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="service-detail-info">
            <h1 className="service-detail-title">{service.Name}</h1>
            
            <div className="service-rating-section">
              <div className="rating-stars">
                {renderStars(parseFloat(averageRating))}
              </div>
              <span className="rating-number">{averageRating}</span>
              <span className="rating-divider">|</span>
              <span className="review-count">{reviews.length} Reviews</span>
              <span className="rating-divider">|</span>
              <span className="bookings-count">{bookingsCount} Bookings</span>
            </div>

            <div className="service-detail-meta">
              <div className="meta-item">
                <IoPricetagOutline className="meta-icon" />
                <span className="meta-label">Price:</span>
                <span className="meta-value">${service.Price.toFixed(2)}</span>
              </div>
              <div className="meta-item">
                <IoTimeOutline className="meta-icon" />
                <span className="meta-label">Duration:</span>
                <span className="meta-value">{service.DurationMinutes} minutes</span>
              </div>
            </div>

            <div className="service-detail-description">
              <h3>About This Service</h3>
              <p className="short-description">{service.Description}</p>
            </div>


            <button className="book-service-btn" onClick={handleBookService}>
              Book This Service
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const ReviewSection = ({ serviceId, reviews, onSubmitReview, submitting }) => {
  const [newReview, setNewReview] = useState({
    rating: 5,
    comment: ''
  });
  const [hoveredRating, setHoveredRating] = useState(0);

  const handleRatingClick = (rating) => {
    setNewReview({ ...newReview, rating });
  };

  const handleCommentChange = (e) => {
    setNewReview({ ...newReview, comment: e.target.value });
  };

  const handleSubmitReview = (e) => {
    e.preventDefault();
    
    if (!newReview.comment.trim()) {
      alert('Please write a comment');
      return;
    }

    onSubmitReview({
      serviceId,
      rating: newReview.rating,
      comment: newReview.comment
    })
      .then(() => {
        setNewReview({ rating: 5, comment: '' });
        alert('Review submitted successfully!');
      })
      .catch((err) => {
        alert(err?.message || 'Failed to submit review');
      });
  };

  const renderStars = (rating, interactive = false) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
      const isHovered = interactive && hoveredRating >= i;
      const isFilled = interactive ? (hoveredRating >= i || (hoveredRating === 0 && i <= rating)) : i <= fullStars;
      const isHalf = !interactive && i === fullStars + 1 && hasHalfStar;

      if (interactive) {
        stars.push(
          <button
            key={i}
            type="button"
            className={`star-btn ${isFilled ? 'filled' : ''}`}
            onMouseEnter={() => setHoveredRating(i)}
            onMouseLeave={() => setHoveredRating(0)}
            onClick={() => handleRatingClick(i)}
          >
            {isFilled || isHovered ? <IoStar /> : <IoStarOutline />}
          </button>
        );
      } else {
        if (isFilled) {
          stars.push(<IoStar key={i} className="star-icon filled" />);
        } else if (isHalf) {
          stars.push(<IoStarHalf key={i} className="star-icon filled" />);
        } else {
          stars.push(<IoStarOutline key={i} className="star-icon" />);
        }
      }
    }
    
    return stars;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <section className="review-section">
      <div className="review-container">
        <div className="section-header">
          <h2 className="section-title">Customer Reviews</h2>
          
        </div>

        <div className="write-review-card">
          <h3>Share Your Experience</h3>
          <form onSubmit={handleSubmitReview}>
            <div className="form-group">
              <label>Your Rating</label>
              <div className="rating-input">
                {renderStars(newReview.rating, true)}
                <span className="rating-value">{newReview.rating} {newReview.rating === 1 ? 'star' : 'stars'}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="comment">Your Review</label>
              <textarea
                id="comment"
                rows="5"
                placeholder="Share your thoughts about this service..."
                value={newReview.comment}
                onChange={handleCommentChange}
                required
              />
            </div>

            <button type="submit" className="submit-review-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>
        </div>

        <div className="reviews-list">
          {reviews.length === 0 ? (
            <div className="no-reviews">
              <p>No reviews yet. Be the first to share your experience!</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.ReviewId} className="review-item">
                <div className="review-header">
                  <div className="reviewer-info">
                    <div className="reviewer-avatar">
                      {review.Avatar ? <img src={`${review.Avatar}${String(review.Avatar).includes('?') ? '&' : '?'}v=${review._avatarVersion || 1}`} alt={review.CustomerName} /> : <div className="service-image-placeholder" />}
                    </div>
                    <div className="reviewer-details">
                      <h4 className="reviewer-name">{review.CustomerName}</h4>
                      <span className="review-date">{formatDate(review.CreatedAt)}</span>
                    </div>
                  </div>
                  <div className="review-rating">
                    {renderStars(review.Rating)}
                  </div>
                </div>
                <p className="review-comment">{review.Comment}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

const RecommendedServicesSection = ({ currentServiceId }) => {
  const navigate = useNavigate();
  const { services } = useServices();
  const [recommendedServices, setRecommendedServices] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [servicesPerSlide, setServicesPerSlide] = useState(4);

  useEffect(() => {
    const sourceServices = Array.isArray(services) ? services : [];
    const otherServices = sourceServices.filter(
      (service) => String(service.ServiceId) !== String(currentServiceId)
    );
    
    const shuffled = otherServices.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 8);
    
    const timer = setTimeout(() => {
      setRecommendedServices(selected);
    }, 0);
    
    return () => clearTimeout(timer);
  }, [currentServiceId, services]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setServicesPerSlide(4);
      } else if (window.innerWidth >= 768) {
        setServicesPerSlide(2);
      } else {
        setServicesPerSlide(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleServiceClick = (serviceId) => {
    navigate(`/service/${serviceId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalSlides = Math.ceil(recommendedServices.length / servicesPerSlide);

  useEffect(() => {
    if (!isAutoPlay || totalSlides <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlay, totalSlides]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlay(false);
  };

  if (recommendedServices.length === 0) return null;

  return (
    <section className="recommended-services-section">
      <div className="recommended-container">
        <h2 className="section-title">You May Also Like</h2>
        
        <div className="recommended-carousel-container">
          <div className="recommended-carousel">
            <div 
              className="recommended-track"
              style={{
                transform: `translateX(-${currentSlide * 100}%)`,
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => {
                const startIdx = slideIndex * servicesPerSlide;
                const slideServices = recommendedServices.slice(startIdx, startIdx + servicesPerSlide);
                
                return (
                  <div key={slideIndex} className="recommended-slide">
                    {slideServices.map((service) => {
                      const cardImage = resolveApiImageUrl(service.ImageUrl);
                      return (
                        <div 
                          key={service.ServiceId} 
                          className="recommended-service-card"
                          onClick={() => handleServiceClick(service.ServiceId)}
                        >
                          <div className="recommended-service-image">
                            {cardImage ? <img src={cardImage} alt={service.Name} /> : <div className="service-image-placeholder" />}
                          </div>
                          <div className="recommended-service-content">
                            <h3>{service.Name}</h3>
                            <p className="service-brief">{service.Description}</p>
                            <div className="service-footer">
                              <span className="service-price">${Number(service.Price || 0).toFixed(2)}</span>
                              <span className="service-duration">{service.DurationMinutes} min</span>
                            </div>
                            <button className="view-details-btn">
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
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

const ServiceDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const passedService = location.state?.service;
  
  const { services, loading, error } = useServices();
  const {
    reviews,
    ratingSummary,
    loading: reviewsLoading,
    error: reviewsError,
    submitReview,
  } = useServiceReviews(id, 50);

  const service = useMemo(() => {
    // If service was passed through navigation state, use it
    if (passedService) {
      return passedService;
    }
    
    // Otherwise find from services list
    const serviceList = Array.isArray(services) ? services : [];
    return serviceList.find((item) => String(item.ServiceId) === String(id)) || null;
  }, [services, id, passedService]);

  const serviceReviews = useMemo(() => (Array.isArray(reviews) ? reviews : []), [reviews]);

  const serviceWithRating = useMemo(() => {
    if (!service) return null;
    return {
      ...service,
      AverageRating: Number(ratingSummary?.AverageRating || 0),
      ReviewCount: Number(ratingSummary?.ReviewCount || serviceReviews.length || 0),
    };
  }, [service, ratingSummary, serviceReviews.length]);

  if (loading) {
    return <div className="loading">Loading service details...</div>;
  }

  if (error) {
    return <div className="error">Error loading service details: {error}</div>;
  }

  if (reviewsError) {
    console.error('Error loading service reviews:', reviewsError);
  }

  if (!serviceWithRating) {
    return (
      <div className="service-not-found">
        <h2>Service Not Found</h2>
        <p>The service you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="service-detail-page">
      <ServiceDetailSection service={serviceWithRating} reviews={serviceReviews} />
      <ReviewSection
        serviceId={serviceWithRating.ServiceId}
        reviews={serviceReviews}
        onSubmitReview={submitReview}
        submitting={reviewsLoading}
      />
      <RecommendedServicesSection currentServiceId={serviceWithRating.ServiceId} />
    </div>
  );
};

export default ServiceDetail;
