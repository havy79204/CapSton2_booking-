import { useMemo, useState } from 'react';
import {
  IoArrowBack,
  IoBusinessOutline,
  IoPersonOutline,
  IoCalendarOutline,
  IoCardOutline,
  IoLocationOutline,
  IoTicketOutline,
  IoCheckmarkCircleOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline
} from 'react-icons/io5';
import {
  mockUsers,
  mockAddresses,
  mockServices,
  mockBookings,
  mockBookingServices,
  mockServiceCategories,
  mockServiceReviews
} from '../lib/mockData';
import '../styles/BookingPage.css';

const BookingPage = () => {
  const selectedServiceIdFromState = location.state?.serviceId;
  const currentUser = mockUsers[0] || null;
  const currentUserBookings = mockBookings
    .filter((booking) => booking.UserId === currentUser?.UserId)
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

  const seedBooking =
    currentUserBookings.find((booking) => booking.Status === 'Pending' || booking.Status === 'Confirmed') ||
    currentUserBookings[0] ||
    null;

  const defaultAddress =
    mockAddresses.find((address) => address.UserId === currentUser?.UserId && address.IsDefault) ||
    mockAddresses.find((address) => address.UserId === currentUser?.UserId) ||
    mockAddresses[0] ||
    null;

  const seedBookingServices = seedBooking
    ? mockBookingServices.filter((bookingService) => bookingService.BookingId === seedBooking.BookingId)
    : [];

  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedDate, setSelectedDate] = useState(
    seedBooking ? seedBooking.BookingTime.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [selectedTime, setSelectedTime] = useState(
    seedBooking ? new Date(seedBooking.BookingTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00'
  );
  const [giftCode, setGiftCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('store');

  const [serviceSelections, setServiceSelections] = useState(() => {
    return mockServices.map((service) => {
      const booked = seedBookingServices.find((item) => item.ServiceId === service.ServiceId);
      const selectedFromNavigation = selectedServiceIdFromState === service.ServiceId;

      return {
        ...service,
        quantity: selectedFromNavigation ? 1 : (booked ? 1 : 0),
        selectedPrice: booked?.Price ?? service.Price
      };
    });
  });

  const categories = ['All', ...mockServiceCategories.map((category) => category.Name)];

  const availableTimeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 9; hour <= 19; hour += 1) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
      if (hour !== 19) {
        slots.push(`${String(hour).padStart(2, '0')}:30`);
      }
    }
    return slots;
  }, []);

  const selectedServiceItems = serviceSelections.filter((service) => service.quantity > 0);

  const filteredServices = serviceSelections.filter((service) => {
    if (activeCategory === 'All') return true;

    const serviceCategory = mockServiceCategories.find((category) => category.CategoryId === service.CategoryId);
    return serviceCategory?.Name === activeCategory;
  });

  const subtotal = selectedServiceItems.reduce(
    (sum, service) => sum + (service.selectedPrice * service.quantity),
    0
  );
  const totalDuration = selectedServiceItems.reduce(
    (sum, service) => sum + (service.DurationMinutes * service.quantity),
    0
  );

  const discount = giftCode.trim() ? Math.min(5, subtotal * 0.1) : 0;
  const total = Math.max(subtotal - discount, 0);

  const selectedTechnician = (() => {
    if (selectedServiceItems.length === 0) return 'Our Specialist Team';
    const firstService = selectedServiceItems[0];
    const serviceReview = mockServiceReviews.find((review) => review.ServiceId === firstService.ServiceId);
    return serviceReview?.CustomerName || 'Senior Technician';
  })();

  const changeServiceQuantity = (serviceId, delta) => {
    setServiceSelections((prev) => prev.map((service) => {
      if (service.ServiceId !== serviceId) return service;

      const newQuantity = service.quantity + delta;
      if (newQuantity < 0) return service;
      if (newQuantity > 5) return service;

      return { ...service, quantity: newQuantity };
    }));
  };

  const handleBookNow = () => {
    if (selectedServiceItems.length === 0) {
      alert('Please select at least one service.');
      return;
    }

    alert('Booking request submitted successfully!');
  };

  return (
    <section className="booking-page">
      <div className="booking-container">
        <div className="booking-page-head">
          <h1>BOOK YOUR APPOINTMENT</h1>
          <p>Easily book your appointment online</p>
        </div>

        <div className="booking-grid">
          <div className="booking-left-panel">
            <div className="booking-card">
              <div className="booking-card-title">
                <span className="step-dot">1</span>
                <h3>Select salon &amp; services</h3>
              </div>

              <div className="booking-inline-section">
                <label><IoBusinessOutline /> Salon</label>
                <div className="info-row">
                  <div>
                    <strong>NIOM&amp;CE</strong>
                    <p>{defaultAddress ? `${defaultAddress.City}, ${defaultAddress.Country}` : 'Nail Studio'}</p>
                  </div>
                  <button type="button">Change</button>
                </div>
              </div>

              <div className="booking-inline-section">
                <label><IoPersonOutline /> Technician</label>
                <div className="info-row">
                  <div>
                    <strong>{selectedTechnician}</strong>
                    <p>Assigned based on selected services</p>
                  </div>
                  <button type="button">Change</button>
                </div>
              </div>

              <div className="booking-inline-section">
                <label><IoCheckmarkCircleOutline /> Services</label>

                <div className="category-tabs">
                  {categories.map((category) => (
                    <button
                      key={category}
                      className={`category-btn ${activeCategory === category ? 'active' : ''}`}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="services-list-box">
                  {filteredServices.map((service) => (
                    <div key={service.ServiceId} className="service-line">
                      <div className="service-line-info">
                        <strong>{service.Name}</strong>
                        <p>{service.DurationMinutes} min</p>
                      </div>

                      <div className="service-line-actions">
                        <div className="service-qty">
                          <button onClick={() => changeServiceQuantity(service.ServiceId, -1)}>-</button>
                          <span>{service.quantity}</span>
                          <button onClick={() => changeServiceQuantity(service.ServiceId, 1)}>+</button>
                        </div>
                        <span className="service-price-chip">From ${service.selectedPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="booking-card">
              <div className="booking-inline-section">
                <label><IoCalendarOutline /> Schedule</label>
                <div className="schedule-controls">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>

                <p className="times-title">Available times</p>
                <div className="time-grid">
                  {availableTimeSlots.map((timeSlot) => (
                    <button
                      key={timeSlot}
                      className={`time-btn ${selectedTime === timeSlot ? 'active' : ''}`}
                      onClick={() => setSelectedTime(timeSlot)}
                    >
                      {timeSlot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="booking-right-panel">
            <div className="booking-card sticky-card">
              <div className="booking-card-title">
                <span className="step-dot">2</span>
                <h3>Confirmation</h3>
              </div>

              <div className="mini-summary">
                <strong>NIOM&amp;CE</strong>
                <p>{defaultAddress ? `${defaultAddress.AddressLine}, ${defaultAddress.City}, ${defaultAddress.Country}` : '-'}</p>
              </div>

              <div className="confirm-row-grid">
                <div className="confirm-row-item">
                  <label><IoCalendarOutline /> Date &amp; Time</label>
                  <span>{selectedDate} • {selectedTime}</span>
                </div>
                <div className="confirm-row-item">
                  <label><IoPersonOutline /> Technician</label>
                  <span>{selectedTechnician}</span>
                </div>
              </div>

              <div className="info-inputs">
                <input type="text" value={currentUser?.Phone || ''} readOnly placeholder="Your phone" />
                <input type="text" value={currentUser?.Name || ''} readOnly placeholder="Your name" />
                <textarea rows="2" value={seedBooking?.Notes || ''} readOnly placeholder="Add note" />
              </div>

              <div className="booking-summary-box">
                <h4>Booking Summary</h4>
                <div className="summary-services">
                  <div className="summary-head">
                    <span>Services</span>
                    <span>Duration</span>
                    <span>Price</span>
                  </div>
                  {selectedServiceItems.length === 0 ? (
                    <p className="summary-empty">No service selected</p>
                  ) : (
                    selectedServiceItems.map((service) => (
                      <div className="summary-service-row" key={service.ServiceId}>
                        <span>{service.Name}{service.quantity > 1 ? ` x${service.quantity}` : ''}</span>
                        <span>{service.DurationMinutes * service.quantity} min</span>
                        <span>${(service.selectedPrice * service.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="total-lines">
                  <div><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div><span>Duration</span><span>{totalDuration} min</span></div>
                </div>

                <div className="gift-row-booking">
                  <input
                    type="text"
                    placeholder="Enter Gift code..."
                    value={giftCode}
                    onChange={(event) => setGiftCode(event.target.value)}
                  />
                  <button type="button">Apply</button>
                </div>

                <div className="discount-row">
                  <span><IoTicketOutline /> Sale</span>
                  <span>-${discount.toFixed(2)}</span>
                </div>

                <div className="booking-total-row">
                  <strong>Total</strong>
                  <strong>${total.toFixed(2)}</strong>
                </div>
              </div>

              <div className="payment-methods-box">
                <h4>Payment method</h4>
                <label className={`payment-booking-option ${paymentMethod === 'store' ? 'active' : ''}`}>
                  <span><IoCardOutline /> Pay at Store</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'store'}
                    onChange={() => setPaymentMethod('store')}
                  />
                </label>
                <label className={`payment-booking-option ${paymentMethod === 'online' ? 'active' : ''}`}>
                  <span><IoCardOutline /> Pay online</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'online'}
                    onChange={() => setPaymentMethod('online')}
                  />
                </label>
              </div>

              <button className="book-now-btn-main" onClick={handleBookNow}>
                <IoCalendarOutline /> Book Now
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default BookingPage;