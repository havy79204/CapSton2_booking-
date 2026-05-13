import { useState, useEffect, useMemo } from 'react';
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
import { useAuthMe } from '../hooks/useAuthMe';
import PortalModal from '../components/Layout portal/PortalModal.jsx';
import { api, resolveApiImageUrl } from '../lib/api.js';
import { useCustomerCart } from '../hooks/useCustomerCommerce';
import { formatVnd } from '../lib/currency';
import '../styles/ProductDetail.css';
import '../styles/OwnerServiceDetail.css';

const ProductDetailSection = ({ product, ratingSummary, isOwnerMode = false }) => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const { addItem, updateItem, cart, busy: cartBusy } = useCustomerCart();
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [cartMessage, setCartMessage] = useState('');

  const productVariants = useMemo(() => {
    const rawVariants = Array.isArray(product?.Variants)
      ? product.Variants
      : Array.isArray(product?.ProductVariants)
        ? product.ProductVariants
        : [];

    return rawVariants.map((variant) => ({
      VariantId: variant?.VariantId ?? variant?.variantId ?? '',
      ProductId: variant?.ProductId ?? variant?.productId ?? product?.ProductId ?? '',
      VariantName: variant?.VariantName ?? variant?.name ?? '',
      Stock: Number(variant?.Stock ?? variant?.stock ?? 0),
      Price: variant?.Price ?? variant?.price ?? null,
      PriceVnd: variant?.PriceVnd ?? variant?.priceVnd ?? null,
      SellPriceVnd: variant?.SellPriceVnd ?? variant?.sellPriceVnd ?? null,
    }));
  }, [product]);
  
  const [selectedVariant, setSelectedVariant] = useState(
    () => productVariants.find((variant) => Number(variant?.Stock || 0) > 0) || productVariants[0] || null,
  );

  const galleryImages = (() => {
    const normalize = (raw) => {
      if (raw === undefined || raw === null) return ''
      if (typeof raw === 'string') return resolveApiImageUrl(raw)
      if (typeof raw === 'object') return resolveApiImageUrl(raw.url || raw.ImageUrl || '')
      return ''
    }

    const images = Array.isArray(product.Images) ? product.Images.map((i) => normalize(i)).filter(Boolean) : []
    if (images.length > 0) return images
    const single = normalize(product.ImageUrl)
    return single ? [single] : []
  })();

  const averageRating = Number(ratingSummary?.AverageRating || 0).toFixed(1);
  const reviewCount = Number(ratingSummary?.ReviewCount || 0);

  const soldCount = Number(product.SoldCount || 0);

  const handleGoBack = () => {
    if (isOwnerMode) {
      navigate('/portals/owner/products');
      return;
    }
    navigate(-1);
  };

  const handleThumbnailClick = (index) => {
    setSelectedImage(index);
  };

  const baseUnitPriceRaw = Number(product.DisplayPrice ?? product.Price ?? 0);
  const baseUnitPrice = Number.isFinite(baseUnitPriceRaw) ? baseUnitPriceRaw : 0;
  const variantUnitPriceRaw = Number(selectedVariant?.PriceVnd ?? selectedVariant?.SellPriceVnd ?? selectedVariant?.Price);
  const currentUnitPrice = Number.isFinite(variantUnitPriceRaw) && variantUnitPriceRaw > 0
    ? variantUnitPriceRaw
    : baseUnitPrice;

  const handleQuantityChange = (change) => {
    const currentQuantity = Number(quantity || 1);
    const newQuantity = currentQuantity + change;
    const maxQuantity = Number(selectedVariant ? selectedVariant.Stock : product.Stock || 0);
    
    if (newQuantity >= 1 && newQuantity <= maxQuantity) {
      setQuantity(newQuantity);
    }
  };

  const handleQuantityInputChange = (event) => {
    const nextValue = Number(event.target.value);
    const maxQuantity = Number(selectedVariant ? selectedVariant.Stock : product.Stock || 0);

    if (!Number.isFinite(nextValue)) {
      return;
    }

    setQuantity(Math.max(1, Math.min(nextValue, maxQuantity)));
  };

  const handleAddToCart = async () => {
    const rawStock = selectedVariant ? selectedVariant.Stock : product.Stock;
    const currentStock = Number(rawStock || 0);
    const qty = Number(quantity || 1);
    const variantId = String(selectedVariant?.VariantId || '').trim();
    
    if (!product.ProductId) {
      setCartMessage('Error: Product ID is missing. Cannot add to cart.');
      setCartModalOpen(true);
      return;
    }
    
    if (!currentStock || currentStock <= 0) {
      setCartMessage('Product is out of stock.');
      setCartModalOpen(true);
      return;
    }
    
    const existingItem = cart?.Items?.find((item) => {
      const sameProduct = String(item.ProductId) === String(product.ProductId);
      const sameVariant = String(item.VariantId || '') === variantId;
      return sameProduct && sameVariant;
    });
    
    if (existingItem) {
      const currentQty = Number(existingItem.Quantity || 0);
      const totalQty = currentQty + qty;
      
      if (totalQty > currentStock) {
        setCartMessage(`Cannot add ${qty} more - only ${currentStock - currentQty} available (already have ${currentQty} in cart)`);
        setCartModalOpen(true);
        return;
      }
      
      try {
        await updateItem(existingItem.CartItemId, { quantity: totalQty });
        setCartMessage(`Updated quantity to ${totalQty}!`);
        setCartModalOpen(true);
      } catch (err) {
        const errorMsg = err?.message || err?.body?.error || 'Failed to update quantity';
        setCartMessage(errorMsg);
        setCartModalOpen(true);
      }
    } else {
      // Product not in cart - add normally
      if (qty > currentStock) {
        setCartMessage(`Quantity exceeds available stock (${currentStock} available)`);
        setCartModalOpen(true);
        return;
      }

      try {
        await addItem({
          productId: product.ProductId,
          variantId: variantId || undefined,
          quantity: qty,
        });
        setCartMessage(`Added ${qty} ${product.Name} to cart!`);
        setCartModalOpen(true);
      } catch (err) {
        const errorMsg = err?.message || err?.body?.error || 'Failed to add item to cart';
        setCartMessage(errorMsg);
        setCartModalOpen(true);
      }
    }
  };

  const handleBuyNow = async () => {
    try {
      await addItem({
        productId: product.ProductId,
        variantId: String(selectedVariant?.VariantId || '').trim() || undefined,
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

  const totalPrice = currentUnitPrice * quantity;

  return (
    <section className="product-detail-section">
      <div className="product-detail-container">
        <button className="back-btn" onClick={handleGoBack}>
          <IoArrowBack /> {isOwnerMode ? 'Back to Products' : 'Back to Shop'}
        </button>

        <div className="product-detail-content">
          <div className="product-detail-image-wrapper">
            <div className="product-detail-image">
              {galleryImages[selectedImage] ? (
                <img src={galleryImages[selectedImage]} alt={product.Name} />
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
                <span className="product-price">{formatVnd(totalPrice)}</span>
                {selectedVariant ? (
                  <span className="selected-variant-name">
                    {selectedVariant.VariantName}
                  </span>
                ) : null}
                <span className="selected-variant-name">
                  Unit: {formatVnd(currentUnitPrice)}
                </span>
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

            {!isOwnerMode && productVariants.length > 0 && (
              <div className="product-variants">
                <label>Select Variant:</label>
                <div className="variants-grid">
                  {productVariants.map((variant) => (
                    <button
                      key={variant.VariantId}
                      className={`variant-btn ${selectedVariant?.VariantId === variant.VariantId ? 'active' : ''} ${variant.Stock === 0 ? 'disabled' : ''}`}
                      onClick={() => {
                        if (variant.Stock > 0) {
                          setSelectedVariant(variant)
                          setQuantity(1)
                        }
                      }}
                      disabled={variant.Stock === 0}
                    >
                      <span className="variant-name">{variant.VariantName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isOwnerMode && !isOutOfStock && (
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
                    type="number" 
                    min="1"
                    max={currentStock}
                    step="1"
                    value={quantity} 
                    onChange={handleQuantityInputChange}
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

            {!isOwnerMode ? (
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
            ) : null}
          </div>
        </div>
      </div>

      <PortalModal
        open={cartModalOpen}
        title={cartMessage.includes('Error') || cartMessage.includes('out of stock') ? 'Notice' : 'Cart Updated'}
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

const ReviewSection = ({ productId, reviews, onSubmitReview, onDeleteReview, currentUserId = '', submitting, allowWrite = true }) => {
  const [newReview, setNewReview] = useState({
    rating: 5,
    comment: '',
  });
  const [reviewImageDataUrls, setReviewImageDataUrls] = useState([]);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [activeOwnMenuReviewId, setActiveOwnMenuReviewId] = useState('');
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageModalTitle, setMessageModalTitle] = useState('Notice');
  const [messageModalText, setMessageModalText] = useState('');
  const [editingReviewId, setEditingReviewId] = useState('');

  const handleRatingClick = (rating) => {
    setNewReview((prev) => ({ ...prev, rating }));
  };

  const handleCommentChange = (event) => {
    setNewReview((prev) => ({ ...prev, comment: event.target.value }));
  };

  const handleReviewImageChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const toDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    try {
      const dataUrls = await Promise.all(files.map((file) => toDataUrl(file)));
      setReviewImageDataUrls((prev) => {
        const merged = [...prev, ...dataUrls.filter(Boolean)];
        const unique = Array.from(new Set(merged));
        return unique.slice(0, 3);
      });
    } catch {
      alert('Failed to read selected image files');
    } finally {
      event.target.value = '';
    }
  };

  const removeSelectedReviewImage = (indexToRemove) => {
    setReviewImageDataUrls((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmitReview = (event) => {
    event.preventDefault();

    if (!String(newReview.comment || '').trim()) {
      alert('Please write a comment');
      return;
    }

    onSubmitReview({
      productId,
      reviewId: editingReviewId || undefined,
      rating: newReview.rating,
      comment: newReview.comment,
      images: reviewImageDataUrls,
    })
      .then(() => {
        const isEditing = Boolean(editingReviewId);
        setNewReview({ rating: 5, comment: '' });
        setReviewImageDataUrls([]);
        setEditingReviewId('');
        setMessageModalTitle(isEditing ? 'Review Updated' : 'Review Submitted');
        setMessageModalText(isEditing ? 'Your review has been updated successfully.' : 'Your review has been submitted successfully.');
        setMessageModalOpen(true);
      })
      .catch((err) => {
        setMessageModalTitle('Error');
        setMessageModalText(err?.message || 'Failed to submit review');
        setMessageModalOpen(true);
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

  const normalizeAvatar = (raw) => {
    if (!raw) return '';
    if (typeof raw === 'string') return resolveApiImageUrl(raw);
    if (typeof raw === 'object') return resolveApiImageUrl(raw.url || raw.ImageUrl || '');
    return '';
  };

  const getReviewImages = (review) => {
    if (Array.isArray(review?.ReviewImages) && review.ReviewImages.length > 0) {
      return review.ReviewImages;
    }

    const raw = review?.ImageUrl;
    if (!raw) return [];

    if (Array.isArray(raw)) {
      return raw.map((x) => resolveApiImageUrl(x)).filter(Boolean);
    }

    const text = String(raw).trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((x) => resolveApiImageUrl(x)).filter(Boolean);
    } catch {
      // Ignore and fallback to single value handling.
    }

    return [resolveApiImageUrl(text)].filter(Boolean);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const askDeleteReview = (review) => {
    setActiveOwnMenuReviewId('');
    setReviewToDelete(review || null);
    setDeleteModalOpen(true);
  };

  const confirmDeleteReview = async () => {
    const review = reviewToDelete;
    setDeleteModalOpen(false);
    setReviewToDelete(null);

    const rid = String(review?.ReviewId || '').trim();
    if (!rid || !onDeleteReview) return;

    try {
      await onDeleteReview(rid);
      if (editingReviewId && editingReviewId === rid) {
        setEditingReviewId('');
        setNewReview({ rating: 5, comment: '' });
        setReviewImageDataUrls([]);
      }
      setMessageModalTitle('Deleted');
      setMessageModalText('Your review has been deleted.');
      setMessageModalOpen(true);
    } catch (err) {
      setMessageModalTitle('Error');
      setMessageModalText(err?.message || 'Failed to delete review');
      setMessageModalOpen(true);
    }
  };

  const startEditReview = (review) => {
    const rid = String(review?.ReviewId || '').trim();
    setActiveOwnMenuReviewId('');
    if (!rid) return;

    setEditingReviewId(rid);
    setNewReview({
      rating: Number(review?.Rating || 5),
      comment: String(review?.Comment || ''),
    });
    setReviewImageDataUrls([]);
  };

  return (
    <section className="review-section">
      <div className="review-container">
        <div className="section-header">
          <h2 className="section-title">Customer Reviews</h2>
        </div>

        {allowWrite ? (
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

              <div className="form-group">
                <label htmlFor="review-images">Review Images (Optional, up to 3)</label>
                <input
                  id="review-images"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  multiple
                  onChange={handleReviewImageChange}
                />
                <p className="review-upload-hint">You can pick multiple times. Maximum 3 images.</p>
                {reviewImageDataUrls.length > 0 ? (
                  <div className="review-selected-list">
                    {reviewImageDataUrls.map((img, index) => (
                      <div className="review-selected-item" key={`${img.slice(0, 30)}-${index}`}>
                        <img
                          src={img}
                          alt={`Selected review ${index + 1}`}
                          className="review-selected-thumb"
                        />
                        <button
                          type="button"
                          className="review-selected-remove"
                          onClick={() => removeSelectedReviewImage(index)}
                          aria-label={`Remove selected image ${index + 1}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <button type="submit" className="submit-review-btn" disabled={submitting}>
                {submitting ? 'Submitting...' : (editingReviewId ? 'Update Review' : 'Submit Review')}
              </button>
            </form>
          </div>
        ) : null}

        <div className="reviews-list">
          {reviews.length === 0 ? (
            <div className="no-reviews">
              <p>{allowWrite ? 'No reviews yet. Be the first to share your experience!' : 'No customer reviews for this product yet.'}</p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={review.ReviewId} className="review-item">
                {String(review?.UserId || '').trim() === String(currentUserId || '').trim() ? (
                  <div className="review-own-actions">
                    <button
                      type="button"
                      className="review-own-menu"
                      onClick={() => setActiveOwnMenuReviewId((prev) => prev === String(review.ReviewId) ? '' : String(review.ReviewId))}
                      aria-label="Open review menu"
                      title="Open review menu"
                    >
                      ⋮
                    </button>
                    {activeOwnMenuReviewId === String(review.ReviewId) ? (
                      <div className="review-own-dropdown">
                        <button type="button" className="review-own-dropdown-item" onClick={() => startEditReview(review)}>Edit</button>
                        <button type="button" className="review-own-dropdown-item is-danger" onClick={() => askDeleteReview(review)}>Delete</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="review-header">
                  <div className="reviewer-info">
                    <div className="reviewer-avatar">
                      {review.Avatar ? (
                        (() => {
                          const avatarUrl = normalizeAvatar(review.Avatar);
                          const suffix = avatarUrl && avatarUrl.includes('?') ? '&' : '?';
                          return avatarUrl ? <img src={`${avatarUrl}${suffix}v=${review._avatarVersion || 1}`} alt={review.CustomerName} /> : <div className="service-image-placeholder"></div>
                        })()
                      ) : (
                        <div className="service-image-placeholder"></div>
                      )}
                    </div>
                    <div className="reviewer-details">
                      <h4 className="reviewer-name">{review.CustomerName}</h4>
                      <span className="review-date">{formatDate(review.CreatedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="review-rating">
                  {renderStars(review.Rating)}
                </div>
                <p className="review-comment">{review.Comment}</p>
                {(() => {
                  const reviewImages = getReviewImages(review);
                  if (!reviewImages.length) return null;

                  return (
                    <div className="review-image-gallery">
                      {reviewImages.map((img, index) => (
                      <a key={`${img}-${index}`} href={img} target="_blank" rel="noreferrer">
                        <img
                          src={img}
                          alt={`Review image ${index + 1}`}
                          className="review-image-thumb"
                        />
                      </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>

        <PortalModal
          open={deleteModalOpen}
          title="Delete Review"
          onClose={() => {
            setDeleteModalOpen(false);
            setReviewToDelete(null);
          }}
          footer={
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setReviewToDelete(null);
                }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteReview}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          }
        >
          <p>Do you want to delete this review?</p>
        </PortalModal>

        <PortalModal
          open={messageModalOpen}
          title={messageModalTitle}
          onClose={() => setMessageModalOpen(false)}
        >
          <p>{messageModalText}</p>
        </PortalModal>
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
                            <>
                              <div className="related-image-fallback" aria-hidden="true" />
                              <img
                                src={resolveApiImageUrl(product.ImageUrl || product.Images?.[0])}
                                alt={product.Name}
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none'
                                }}
                              />
                            </>
                          ) : (
                            <div className="related-image-fallback" aria-hidden="true" />
                          )}
                          {product.Stock === 0 && (
                            <span className="out-of-stock-badge-small">Out of Stock</span>
                          )}
                        </div>
                        <div className="related-product-content">
                          <h3>{product.Name}</h3>
                          <p className="product-brief">{product.Description}</p>
                          <div className="product-footer">
                            <span className="product-price-small">{formatVnd(product.DisplayPrice ?? product.Price ?? 0)}</span>
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

const ProductDetail = ({ ownerMode = false }) => {
  const { id } = useParams();
  const location = useLocation();
  const isOwnerMode = ownerMode || location.pathname.startsWith('/portals/owner/')
  const passedProduct = location.state?.product;
  const { products: apiProducts, error: productsError } = useProducts();
  const {
    reviews: productReviews,
    ratingSummary,
    loading: reviewsLoading,
    error: reviewsError,
    submitReview,
    deleteReview,
  } = useProductReviews(id, 50);
  const { me } = useAuthMe();
  const [product, setProduct] = useState(passedProduct || null);
  const [loading, setLoading] = useState(!passedProduct);

  useEffect(() => {
    let active = true;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        const detail = await api.get(`/api/homepage/products/${encodeURIComponent(String(id || '').trim())}`);
        if (!active) return;
        setProduct(detail || passedProduct || null);
      } catch (error) {
        if (!active) return;
        console.error('Error fetching product:', error);
        if (passedProduct) {
          setProduct(passedProduct);
        } else {
          const products = Array.isArray(apiProducts) ? apiProducts : [];
          const foundProduct = products.find((p) => String(p.ProductId) === String(id));
          setProduct(foundProduct || null);
        }
      }

      if (active) {
        setLoading(false);
      }
    };

    fetchProduct();
    return () => {
      active = false;
    };
  }, [id, apiProducts, passedProduct]);

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
    <div className={`product-detail-page ${isOwnerMode ? 'owner-product-detail-page' : ''}`.trim()}>
      <ProductDetailSection key={String(product?.ProductId || '')} product={product} ratingSummary={ratingSummary} isOwnerMode={isOwnerMode} />
      <ReviewSection
        productId={product.ProductId}
        reviews={Array.isArray(productReviews) ? productReviews : []}
        onSubmitReview={submitReview}
        onDeleteReview={deleteReview}
        currentUserId={String(me?.UserId || me?.userId || me?.sub || '').trim()}
        submitting={reviewsLoading}
        allowWrite={!isOwnerMode}
      />
      {!isOwnerMode ? (
        <RelatedProductsSection 
          products={Array.isArray(apiProducts) ? apiProducts : []}
          currentProductId={product.ProductId} 
          categoryId={product.CategoryId}
        />
      ) : null}
    </div>
  );
};

export default ProductDetail;