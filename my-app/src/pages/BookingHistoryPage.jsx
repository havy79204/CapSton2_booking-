import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoCalendarOutline, IoCheckmarkCircleOutline, IoTimeOutline } from 'react-icons/io5'
import { useCustomerBookings } from '../hooks/useCustomerCommerce'
import '../styles/HistoryPage.css'

function bookingStatusClass(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'C') return 'C'
  if (value.includes('cancel')) return 'cancelled'
  if (value.includes('complete') || value.includes('confirm')) return 'success'
  return 'default'
}

function isC(status) {
  return String(status || '').trim().toLowerCase() === 'C'
}

const BookingHistoryPage = () => {
  const navigate = useNavigate()
  const { bookings, loading, error, cancelBooking } = useCustomerBookings(100)
  const [cancellingId, setCancellingId] = useState('')

  const handleCancel = async (booking) => {
    const bookingId = booking?.BookingId
    if (!bookingId) return
    if (!isC(booking.Status)) {
      alert('Only C bookings can be cancelled')
      return
    }
    if (!window.confirm('Cancel this C booking?')) return

    try {
      setCancellingId(bookingId)
      await cancelBooking(bookingId)
      alert('Booking cancelled successfully')
    } catch (err) {
      alert(err?.message || 'Failed to cancel booking')
    } finally {
      setCancellingId('')
    }
  }

  if (loading) return <div className="loading">Loading booking history...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <section className="history-page">
      <div className="history-container">
        <div className="history-head">
          <div>
            <h2 className="history-title"><IoCalendarOutline /> Booking History</h2>
            <p className="history-subtitle">Track all appointments and cancel C ones quickly.</p>
          </div>
          <button className="history-link-btn" onClick={() => navigate('/booking')}>Book New Service</button>
        </div>

        {bookings.length === 0 ? (
          <div className="history-empty">No bookings found.</div>
        ) : (
          <div className="history-list">
            {bookings.map((booking) => {
              const when = new Date(booking.BookingTime)
              const services = Array.isArray(booking.Services) ? booking.Services : []
              return (
                <article key={booking.BookingId} className="history-card">
                  <header className="history-card-head">
                    <div>
                      <h3 className="history-card-id">{booking.BookingId}</h3>
                      <p className="history-card-time"><IoTimeOutline /> {when.toLocaleString()}</p>
                    </div>
                    <div className="history-badges">
                      <span className={`history-badge ${bookingStatusClass(booking.Status)}`}>
                        <IoCheckmarkCircleOutline /> {booking.Status}
                      </span>
                    </div>
                  </header>

                  <div className="history-grid">
                    <div className="history-kv">
                      <p className="history-kv-label">Total Services</p>
                      <p className="history-kv-value">{services.length}</p>
                    </div>
                    <div className="history-kv">
                      <p className="history-kv-label">Total Duration</p>
                      <p className="history-kv-value">{Number(booking.TotalDuration || 0)} mins</p>
                    </div>
                    <div className="history-kv">
                      <p className="history-kv-label">Total Price</p>
                      <p className="history-kv-value">${Number(booking.TotalPrice || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="history-items">
                    <table className="history-items-table booking-items-table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Duration</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.length === 0 ? (
                          <tr>
                            <td colSpan={3}>No service detail</td>
                          </tr>
                        ) : (
                          services.map((service) => (
                            <tr key={service.BookingServiceId || `${booking.BookingId}-${service.ServiceId}`}>
                              <td>{service.ServiceName || service.ServiceId}</td>
                              <td>{Number(service.DurationMinutes || 0)} mins</td>
                              <td>${Number(service.Price || 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {isC(booking.Status) ? (
                    <div className="history-actions">
                      <button
                        className="history-cancel-btn"
                        disabled={cancellingId === booking.BookingId}
                        onClick={() => handleCancel(booking)}
                      >
                        {cancellingId === booking.BookingId ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default BookingHistoryPage
