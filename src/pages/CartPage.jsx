import { useMemo, useState } from 'react';
import {
  IoTrashOutline,
  IoPricetagOutline,
  IoCardOutline,
  IoWalletOutline,
  IoCartOutline
} from 'react-icons/io5';
import {
  mockAddresses,
  mockOrders,
  mockOrderItems,
  mockProducts,
  mockProductVariants,
  mockProductCategories,
  mockUsers
} from '../lib/mockData';
import '../styles/CartPage.css';

const CartPage = () => {
  const currentUserId = mockUsers[0]?.UserId;
  const currentUserOrders = mockOrders
    .filter((order) => order.UserId === currentUserId)
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

  const activeOrders = currentUserOrders.filter((order) => (
    order.Status === 'Pending' || order.Status === 'Processing' || order.Status === 'Shipped'
  ));

  const cartOrderIds = (activeOrders.length > 0 ? activeOrders : currentUserOrders.slice(0, 1))
    .map((order) => order.OrderId);

  const defaultAddress =
    mockAddresses.find((address) => address.UserId === currentUserId && address.IsDefault) ||
    mockAddresses.find((address) => address.UserId === currentUserId) ||
    mockAddresses[0] ||
    null;

  const [cartItems, setCartItems] = useState(() => {
    const sourceOrderItems = mockOrderItems.filter((item) => cartOrderIds.includes(item.OrderId));

    return sourceOrderItems
      .map((item) => {
        const product = mockProducts.find((currentProduct) => currentProduct.ProductId === item.ProductId);
        if (!product) {
          return null;
        }

        const variant = item.VariantId
          ? mockProductVariants.find((currentVariant) => currentVariant.VariantId === item.VariantId)
          : null;

        const category = mockProductCategories.find(
          (currentCategory) => currentCategory.CategoryId === product.CategoryId
        );

        return {
          id: item.OrderItemId,
          productId: item.ProductId,
          variantName: variant?.VariantName || 'Default',
          categoryName: category?.Name || 'Nail Product',
          quantity: item.Quantity,
          selected: true,
          unitPrice: item.Price ?? product.Price,
          product
        };
      })
      .filter(Boolean);
  });
  const [giftCode, setGiftCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');

  const selectedCount = cartItems.filter((item) => item.selected).length;
  const allSelected = cartItems.length > 0 && selectedCount === cartItems.length;

  const subtotal = useMemo(
    () => cartItems
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems]
  );

  const discount = subtotal >= 30 ? 5 : 0;
  const tax = (subtotal - discount) * 0.1;
  const shipping = selectedCount > 0 ? 3 : 0;
  const total = subtotal - discount + tax + shipping;

  const toggleAll = () => {
    const newValue = !allSelected;
    setCartItems((prev) => prev.map((item) => ({ ...item, selected: newValue })));
  };

  const toggleItem = (itemId) => {
    setCartItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, selected: !item.selected } : item
    )));
  };

  const changeQuantity = (itemId, change) => {
    setCartItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;

      const newQuantity = item.quantity + change;
      if (newQuantity < 1 || newQuantity > item.product.Stock) return item;

      return { ...item, quantity: newQuantity };
    }));
  };

  const removeItem = (itemId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const handleBuyNow = () => {
    if (selectedCount === 0) {
      alert('Please select at least one product.');
      return;
    }

    alert(`Order placed with ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}!`);
  };

  return (
    <section className="cart-page">
      <div className="cart-container">
        <div className="cart-grid">
          <div className="cart-left-column">
            <div className="shipping-card">
              <div className="card-head">
                <h3>Shipping Address</h3>
                <button type="button">Edit</button>
              </div>
              <div className="shipping-main-row">
                <p>{defaultAddress?.FullName || 'Guest Customer'}</p>
                <p>{defaultAddress?.PhoneNumber || '-'}</p>
              </div>
              <div className="shipping-bottom-row">
                <span className="address-badge">Address</span>
                <p>
                  {defaultAddress
                    ? `${defaultAddress.AddressLine}, ${defaultAddress.City}, ${defaultAddress.Country}`
                    : 'No default address found'}
                </p>
              </div>
            </div>

            <div className="cart-list-card">
              <div className="card-head">
                <h2>Shopping Cart</h2>
                <button type="button" onClick={clearCart}>Clear Cart</button>
              </div>

              <label className="select-all-row">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                <span>Select All ({selectedCount})</span>
              </label>

              {cartItems.length === 0 ? (
                <div className="cart-empty">Your cart is empty.</div>
              ) : (
                <div className="cart-items-list">
                  {cartItems.map((item) => (
                    <div key={item.id} className="cart-item-row">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(item.id)}
                      />

                      <div className="cart-item-image">
                        <img src={item.product.ImageUrl} alt={item.product.Name} />
                      </div>

                      <div className="cart-item-info">
                        <h4>{item.product.Name}</h4>
                        <p>Type: {item.variantName}</p>
                        <p>Category: {item.categoryName}</p>
                        <strong>${item.unitPrice.toFixed(2)} USD</strong>
                      </div>

                      <div className="cart-item-actions">
                        <div className="qty-controller">
                          <button onClick={() => changeQuantity(item.id, -1)} disabled={item.quantity <= 1}>-</button>
                          <span>{item.quantity}</span>
                          <button onClick={() => changeQuantity(item.id, 1)} disabled={item.quantity >= item.product.Stock}>+</button>
                        </div>
                        <button className="remove-item-btn" onClick={() => removeItem(item.id)}>
                          <IoTrashOutline /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cart-total-footer">
                <span>Total({selectedCount}) :</span>
                <strong>${subtotal.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <aside className="cart-summary-card">
            <h3>Order Summary</h3>

            <div className="summary-rows">
              <div className="summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="summary-row discount"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>
              <div className="summary-row discount"><span>Tax (10%)</span><span>${tax.toFixed(2)}</span></div>
              <div className="summary-row"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>
            </div>

            <div className="summary-total-row">
              <span>Total</span>
              <strong>${total.toFixed(2)}</strong>
            </div>

            <div className="gift-code-box">
              <div className="gift-row">
                <input
                  type="text"
                  placeholder="Enter Gift code..."
                  value={giftCode}
                  onChange={(event) => setGiftCode(event.target.value)}
                />
                <button type="button">Apply</button>
              </div>
              <div className="sale-row">
                <IoPricetagOutline />
                <span>Sale</span>
                <span>$5.00</span>
              </div>
            </div>

            <div className="payment-card">
              <h4>Payment method</h4>

              <label className={`payment-option ${paymentMethod === 'cod' ? 'active' : ''}`}>
                <div className="payment-left">
                  <IoWalletOutline />
                  <div>
                    <strong>Cash on Delivery (COD)</strong>
                    <p>Pay with cash when you receive your order</p>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
              </label>

              <label className={`payment-option ${paymentMethod === 'online' ? 'active' : ''}`}>
                <div className="payment-left">
                  <IoCardOutline />
                  <div>
                    <strong>Pay online (ATM/QR)</strong>
                    <p>Redirect to VNPAY to pay securely</p>
                  </div>
                </div>
                <input
                  type="radio"
                  checked={paymentMethod === 'online'}
                  onChange={() => setPaymentMethod('online')}
                />
              </label>
            </div>

            <button className="buy-now-main-btn" onClick={handleBuyNow} disabled={selectedCount === 0}>
              <IoCartOutline /> Buy Now
            </button>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default CartPage;