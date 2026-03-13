import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  IoStar, 
  IoStarHalf, 
  IoStarOutline,
  IoTimeOutline,
  IoPricetagOutline,
  IoCheckmarkCircle,
  IoArrowBack
} from 'react-icons/io5';
import {
  createMockServiceReview,
  getMockServiceBookingsCount,
  mockServices,
  mockServiceReviews
} from '../lib/mockData';
import '../styles/ServiceDetail.css';

const ServiceDetailSection = ({ service, reviews }) => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);

  const galleryImages = [
    service.ImageUrl,
    service.ImageUrl,
    service.ImageUrl,
    service.ImageUrl,
    service.ImageUrl,
  ];

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, review) => sum + review.Rating, 0) / reviews.length).toFixed(1)
    : 0;

  const bookingsCount = getMockServiceBookingsCount(service.ServiceId);

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
              <img src={galleryImages[selectedImage]} alt={service.Name} />
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
              <p className="detailed-description">
                Our {service.Name.toLowerCase()} service provides a premium experience with 
                professional-grade products and expert techniques. We ensure the highest 
                standards of hygiene and use only the best materials to deliver exceptional 
                results. Each session is tailored to your preferences and needs, ensuring 
                complete satisfaction.
              </p>
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

const ReviewSection = ({ serviceId }) => {
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState({
    rating: 5,
    comment: ''
  });
  const [hoveredRating, setHoveredRating] = useState(0);

  useEffect(() => {
    const serviceReviews = mockServiceReviews.filter(
      review => review.ServiceId === serviceId
    );
    setReviews(serviceReviews);
  }, [serviceId]);

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

    console.log('Submitting review:', newReview);
    
    const mockNewReview = createMockServiceReview({
      serviceId,
      rating: newReview.rating,
      comment: newReview.comment
    });

    setReviews([mockNewReview, ...reviews]);
    setNewReview({ rating: 5, comment: '' });
    alert('Review submitted successfully!');
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

            <button type="submit" className="submit-review-btn">
              Submit Review
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
                      <img src={review.Avatar} alt={review.CustomerName} />
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
  const [recommendedServices, setRecommendedServices] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [servicesPerSlide, setServicesPerSlide] = useState(4);

  useEffect(() => {
    const otherServices = mockServices.filter(
      service => service.ServiceId !== currentServiceId
    );
    
    const shuffled = otherServices.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 8);
    
    const timer = setTimeout(() => {
      setRecommendedServices(selected);
    }, 0);
    
    return () => clearTimeout(timer);
  }, [currentServiceId]);

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
                    {slideServices.map((service) => (
                      <div 
                        key={service.ServiceId} 
                        className="recommended-service-card"
                        onClick={() => handleServiceClick(service.ServiceId)}
                      >
                        <div className="recommended-service-image">
                          <img src={service.ImageUrl} alt={service.Name} />
                        </div>
                        <div className="recommended-service-content">
                          <h3>{service.Name}</h3>
                          <p className="service-brief">{service.Description}</p>
                          <div className="service-footer">
                            <span className="service-price">${service.Price.toFixed(2)}</span>
                            <span className="service-duration">{service.DurationMinutes} min</span>
                          </div>
                          <button className="view-details-btn">
                            View Details
                          </button>
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

const ServiceDetail = () => {
  const { id } = useParams();
  const [service, setService] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchService = async () => {
      try {
        
        const foundService = mockServices.find(s => s.ServiceId === id);
        const serviceReviews = mockServiceReviews.filter(r => r.ServiceId === id);
        
        setService(foundService);
        setReviews(serviceReviews);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching service:', error);
        setLoading(false);
      }
    };

    fetchService();
  }, [id]);

  if (loading) {
    return <div className="loading">Loading service details...</div>;
  }

  if (!service) {
    return (
      <div className="service-not-found">
        <h2>Service Not Found</h2>
        <p>The service you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="service-detail-page">
      <ServiceDetailSection service={service} reviews={reviews} />
      <ReviewSection serviceId={service.ServiceId} />
      <RecommendedServicesSection currentServiceId={service.ServiceId} />
    </div>
  );
};

export default ServiceDetail;
