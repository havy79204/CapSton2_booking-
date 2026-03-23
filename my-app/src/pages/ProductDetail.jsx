import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { 
  IoStar, 
  IoStarHalf, 
  IoStarOutline,
  IoPricetagOutline,
  IoCheckmarkCircle,
  IoArrowBack,
  IoCartOutline,
  IoFlashOutline,
  IoCubeOutline,
  IoShieldCheckmarkOutline,
  IoGiftOutline
} from 'react-icons/io5';
import {
} from '../lib/mockData';
import { useProductReviews, useProducts } from '../hooks/useHomepage';
import { useCustomerCart } from '../hooks/useCustomerCommerce';
import '../styles/ProductDetail.css';

const ProductDetailSection = ({ product, ratingSummary }) => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const { addItem, updateItem, cart, busy: cartBusy } = useCustomerCart();
  
  const productVariants = [];
  
  const [selectedVariant, setSelectedVariant] = useState(
    productVariants.length > 0 ? productVariants[0] : null
  );

  const galleryImages = Array.isArray(product.Images) && product.Images.length > 0
    ? product.Images
    : [product.ImageUrl].filter(Boolean);

  const averageRating = Number(ratingSummary?.AverageRating || 0).toFixed(1);
  const reviewCount = Number(ratingSummary?.ReviewCount || 0);

  const soldCount = Number(product.SoldCount || 0);

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleThumbnailClick = (index) => {
    setSelectedImage(index);
  };

  const handleQuantityChange = (change) => {
    const newQuantity = quantity + change;
    const maxQuantity = selectedVariant ? selectedVariant.Stock : product.Stock;
    
    if (newQuantity >= 1 && newQuantity <= maxQuantity) {
      setQuantity(newQuantity);
    }
  };

  const handleAddToCart = async () => {
    const rawStock = selectedVariant ? selectedVariant.Stock : product.Stock;
    const currentStock = Number(rawStock || 0);
    const qty = Number(quantity || 1);
    
    if (!product.ProductId) {
      alert('Error: Product ID is missing. Cannot add to cart.');
      return;
    }
    
    if (!currentStock || currentStock <= 0) {
      console.error('❌ Product out of stock');
      alert('Product is out of stock.');
      return;
    }
    
    const existingItem = cart?.Items?.find(item => String(item.ProductId) === String(product.ProductId));
    
    if (existingItem) {
      const currentQty = Number(existingItem.Quantity || 0);
      const totalQty = currentQty + qty;
      
      if (totalQty > currentStock) {
        alert(`Cannot add ${qty} more - only ${currentStock - currentQty} available (already have ${currentQty} in cart)`);
        return;
      }
      
      try {
        await updateItem(existingItem.CartItemId, { quantity: totalQty });
        alert(`Updated quantity to ${totalQty}!`);
      } catch (err) {
        const errorMsg = err?.message || err?.body?.error || 'Failed to update quantity';
        alert(errorMsg);
      }
    } else {
      // Product not in cart - add normally
      if (qty > currentStock) {
        alert(`Quantity exceeds available stock (${currentStock} available)`);
        return;
      }

      try {
        await addItem({
          productId: product.ProductId,
          quantity: qty,
        });
        alert(`Added ${qty} ${product.Name} to cart!`);
      } catch (err) {
        const errorMsg = err?.message || err?.body?.error || 'Failed to add item to cart';
        alert(errorMsg);
      }
    }
  };

  const handleBuyNow = async () => {
    try {
      await addItem({
        productId: product.ProductId,
        quantity,
      });
      navigate('/cart');
    } catch (err) {
      alert(err?.message || 'Failed to proceed to checkout');
    }
  };

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

  const currentStock = selectedVariant ? selectedVariant.Stock : product.Stock;
  const isOutOfStock = currentStock === 0;

  const totalPrice = product.Price * quantity;

  return (
    <section className="product-detail-section">
      <div className="product-detail-container">
        <button className="back-btn" onClick={handleGoBack}>
          <IoArrowBack /> Back to Shop
        </button>

        <div className="product-detail-content">
          <div className="product-detail-image-wrapper">
            <div className="product-detail-image">
              {galleryImages[selectedImage] || product.ImageUrl ? (
                <img src={galleryImages[selectedImage] || product.ImageUrl} alt={product.Name} />
              ) : (
                <div className="service-image-placeholder"></div>
              )}
              {isOutOfStock && (
                <div className="out-of-stock-overlay">
                  <span>Out of Stock</span>
                </div>
              )}
              {!isOutOfStock && currentStock < 10 && (
                <div className="low-stock-badge">
                  Only {currentStock} left!
                </div>
              )}
            </div>

            <div className="image-gallery-thumbnails">
              {galleryImages.slice(0, 3).map((img, index) => (
                <div
                  key={index}
                  className={`thumbnail-item ${selectedImage === index ? 'active' : ''} ${index === 2 ? 'has-more' : ''}`}
                  onClick={() => handleThumbnailClick(index)}
                >
                  {img ? <img src={img} alt={`${product.Name} ${index + 1}`} /> : <div className="service-image-placeholder"></div>}
                  {index === 2 && galleryImages.length > 3 && (
                    <div className="thumbnail-overlay">
                      <span className="more-count">+{galleryImages.length - 3}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="product-detail-info">
            <h1 className="product-detail-title">{product.Name}</h1>
            
            <div className="product-rating-section">
              <div className="rating-stars">
                {renderStars(parseFloat(averageRating))}
              </div>
              <span className="rating-number">{averageRating}</span>
              <span className="rating-divider">|</span>
              <span className="review-count">{reviewCount} Reviews</span>
              <span className="rating-divider">|</span>
              <span className="sold-count">{soldCount} Sold</span>
            </div>

            <div className="product-price-section">
              <div className="price-details">
                <span className="product-price">${totalPrice.toFixed(2)}</span>
              </div>
              <div className="product-stock-info">
                <IoCubeOutline />
                <span>{currentStock} in stock</span>
              </div>
            </div>

            <div className="product-description">
              <h3>Product Description</h3>
              <p>{product.Description}</p>
            </div>

            {productVariants.length > 0 && (
              <div className="product-variants">
                <label>Select Variant:</label>
                <div className="variants-grid">
                  {productVariants.map((variant) => (
                    <button
                      key={variant.VariantId}
                      className={`variant-btn ${selectedVariant?.VariantId === variant.VariantId ? 'active' : ''} ${variant.Stock === 0 ? 'disabled' : ''}`}
                      onClick={() => variant.Stock > 0 && setSelectedVariant(variant)}
                      disabled={variant.Stock === 0}
                    >
                      {variant.VariantName}
                      {variant.Stock === 0 && <span className="variant-out">Out</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isOutOfStock && (
              <div className="quantity-section">
                <label>Quantity:</label>
                <div className="quantity-controls">
                  <button 
                    className="qty-btn" 
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                  >
                    -
                  </button>
                  <input 
                    type="text" 
                    value={quantity} 
                    readOnly 
                    className="qty-input"
                  />
                  <button 
                    className="qty-btn" 
                    onClick={() => handleQuantityChange(1)}
                    disabled={quantity >= currentStock}
                  >
                    +
                  </button>
                </div>
                <span className="max-quantity">Max: {currentStock} items</span>
              </div>
            )}

            <div className="product-actions">
              {!isOutOfStock ? (
                <>
                  <button className="add-to-cart-btn" onClick={handleAddToCart} disabled={cartBusy}>
                    <IoCartOutline /> Add to Cart
                  </button>
                  <button className="buy-now-btn" onClick={handleBuyNow} disabled={cartBusy}>
                    <IoFlashOutline /> Buy Now
                  </button>
                </>
              ) : (
                <button className="out-of-stock-btn" disabled>
                  Out of Stock
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const ReviewSection = ({ productId, reviews, onSubmitReview, submitting }) => {
  const [newReview, setNewReview] = useState({
    rating: 5,
    comment: '',
  });
  const [hoveredRating, setHoveredRating] = useState(0);

  const handleRatingClick = (rating) => {
    setNewReview((prev) => ({ ...prev, rating }));
  };

  const handleCommentChange = (event) => {
    setNewReview((prev) => ({ ...prev, comment: event.target.value }));
  };

  const handleSubmitReview = (event) => {
    event.preventDefault();

    if (!String(newReview.comment || '').trim()) {
      alert('Please write a comment');
      return;
    }

    onSubmitReview({
      productId,
      rating: newReview.rating,
      comment: newReview.comment,
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
                placeholder="Share your thoughts about this product..."
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
                      {review.Avatar ? <img src={`${review.Avatar}${String(review.Avatar).includes('?') ? '&' : '?'}v=${review._avatarVersion || 1}`} alt={review.CustomerName} /> : <div className="service-image-placeholder"></div>}
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

const RelatedProductsSection = ({ products, currentProductId, categoryId }) => {
  const navigate = useNavigate();
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [productsPerSlide, setProductsPerSlide] = useState(4);

  useEffect(() => {
    let related = products.filter(
      product => String(product.CategoryId) === String(categoryId) && String(product.ProductId) !== String(currentProductId)
    );
    
    if (related.length < 8) {
      const others = products.filter(
        product => String(product.ProductId) !== String(currentProductId) && !related.includes(product)
      );
      related = [...related, ...others].slice(0, 8);
    } else {
      related = related.slice(0, 8);
    }
    
    const timer = setTimeout(() => {
      setRelatedProducts(related);
    }, 0);
    
    return () => clearTimeout(timer);
  }, [currentProductId, categoryId, products]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setProductsPerSlide(4);
      } else if (window.innerWidth >= 768) {
        setProductsPerSlide(2);
      } else {
        setProductsPerSlide(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleProductClick = (productId) => {
    navigate(`/product/${productId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalSlides = Math.ceil(relatedProducts.length / productsPerSlide);

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

  if (relatedProducts.length === 0) return null;

  return (
    <section className="related-products-section">
      <div className="related-container">
        <h2 className="section-title">Related Products</h2>
        
        <div className="related-carousel-container">
          <div className="related-carousel">
            <div 
              className="related-track"
              style={{
                transform: `translateX(-${currentSlide * 100}%)`,
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {Array.from({ length: totalSlides }).map((_, slideIndex) => {
                const startIdx = slideIndex * productsPerSlide;
                const slideProducts = relatedProducts.slice(startIdx, startIdx + productsPerSlide);
                
                return (
                  <div key={slideIndex} className="related-slide">
                    {slideProducts.map((product) => (
                      <div 
                        key={product.ProductId} 
                        className="related-product-card"
                        onClick={() => handleProductClick(product.ProductId)}
                      >
                        <div className="related-product-image">
                          {product.ImageUrl || product.Images?.[0] ? (
                            <img src={product.ImageUrl || product.Images?.[0]} alt={product.Name} />
                          ) : (
                            <div className="service-image-placeholder"></div>
                          )}
                          {product.Stock === 0 && (
                            <span className="out-of-stock-badge-small">Out of Stock</span>
                          )}
                        </div>
                        <div className="related-product-content">
                          <h3>{product.Name}</h3>
                          <p className="product-brief">{product.Description}</p>
                          <div className="product-footer">
                            <span className="product-price-small">${Number(product.Price || 0).toFixed(2)}</span>
                            <span className="product-stock-small">{product.Stock} in stock</span>
                          </div>
                          <button className="view-details-btn-small">
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

const ProductDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const passedProduct = location.state?.product;
  const { products: apiProducts, loading: productsLoading, error: productsError } = useProducts();
  const {
    reviews: productReviews,
    ratingSummary,
    loading: reviewsLoading,
    error: reviewsError,
    submitReview,
  } = useProductReviews(id, 50);
  const [product, setProduct] = useState(passedProduct || null);
  const [loading, setLoading] = useState(!passedProduct);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        // If product was passed through navigation state, use it
        if (passedProduct) {
          setProduct(passedProduct);
          setLoading(false);
          return;
        }

        // Otherwise, find from apiProducts
        const products = Array.isArray(apiProducts) ? apiProducts : [];
        const foundProduct = products.find(p => String(p.ProductId) === String(id));
        
        if (!foundProduct) {
          console.error('Product not found');
        }

        setProduct(foundProduct);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching product:', error);
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, apiProducts, passedProduct]);

  if (productsLoading) {
    return <div className="loading">Loading product details...</div>;
  }

  if (productsError) {
    return <div className="error">Error loading products: {productsError}</div>;
  }

  if (reviewsError) {
    console.error('Error loading product reviews:', reviewsError);
  }

  if (loading || reviewsLoading) {
    return <div className="loading">Loading product details...</div>;
  }

  if (!product) {
    return (
      <div className="product-not-found">
        <h2>Product Not Found</h2>
        <p>The product you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="product-detail-page">
      <ProductDetailSection product={product} ratingSummary={ratingSummary} />
      <ReviewSection
        productId={product.ProductId}
        reviews={Array.isArray(productReviews) ? productReviews : []}
        onSubmitReview={submitReview}
        submitting={reviewsLoading}
      />
      <RelatedProductsSection 
        products={Array.isArray(apiProducts) ? apiProducts : []}
        currentProductId={product.ProductId} 
        categoryId={product.CategoryId}
      />
    </div>
  );
};

export default ProductDetail;