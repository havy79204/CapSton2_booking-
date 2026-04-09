import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoCalendarOutline, IoCheckmarkCircleOutline, IoTimeOutline } from 'react-icons/io5'
import { useCustomerBookings } from '../hooks/useCustomerCommerce'
import PortalModal from '../components/Layout portal/PortalModal.jsx'
import { api } from '../lib/api.js'
import { formatVnd } from '../lib/currency'
import '../styles/HistoryPage.css'

function bookingStatusClass(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'pending') return 'pending'
  if (value.includes('cancel')) return 'cancelled'
  if (value.includes('complete') || value.includes('confirm')) return 'success'
  return 'default'
}

function isPending(status) {
  return String(status || '').trim().toLowerCase() === 'pending'
}

function isCompleted(status) {
  const value = String(status || '').trim().toLowerCase()
  return value.includes('complete') || value.includes('confirm') || value.includes('done')
}

function fmtMoney(value) {
  return formatVnd(value || 0)
}

const BookingHistoryPage = () => {
  const navigate = useNavigate()
  const { bookings, loading, error, cancelBooking, refresh } = useCustomerBookings(100)
  const [cancellingId, setCancellingId] = useState('')
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [bookingToRate, setBookingToRate] = useState(null)
  const [rating, setRating] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingImageDataUrls, setRatingImageDataUrls] = useState([])
  const [ratingTarget, setRatingTarget] = useState('booking')
  const [selectedBookingServiceId, setSelectedBookingServiceId] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [resultTitle, setResultTitle] = useState('')

  const handleCancel = async (booking) => {
    const bookingId = booking?.BookingId
    if (!bookingId) return
    if (!isPending(booking.Status)) {
      alert('Only pending bookings can be cancelled')
      return
    }
    if (!window.confirm('Cancel this pending booking?')) return

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

  const openRatingModal = (booking) => {
    const firstServiceId = String(booking?.Services?.[0]?.BookingServiceId || '').trim()
    setBookingToRate(booking)
    setRating(5)
    setRatingComment('')
    setRatingImageDataUrls([])
    setRatingTarget('booking')
    setSelectedBookingServiceId(firstServiceId)
    setRatingModalOpen(true)
  }

  const closeRatingModal = () => {
    setRatingModalOpen(false)
    setBookingToRate(null)
    setRating(5)
    setRatingComment('')
    setRatingImageDataUrls([])
    setRatingTarget('booking')
    setSelectedBookingServiceId('')
  }

  const submitRating = async () => {
    if (!bookingToRate?.BookingId) return
    try {
      setSubmittingRating(true)
      if (ratingTarget === 'service') {
        const bookingServiceId = String(selectedBookingServiceId || '').trim()
        if (!bookingServiceId) {
          setResultTitle('Error')
          setResultMessage('Please choose a service to review')
          setResultModalOpen(true)
          return
        }

        await api.post(
          `/api/customer/bookings/${encodeURIComponent(bookingToRate.BookingId)}/services/${encodeURIComponent(bookingServiceId)}/rating`,
          {
            rating: Number(rating),
            comment: ratingComment.trim(),
            images: ratingImageDataUrls,
          },
        )
      } else {
        await api.post('/api/customer/bookings/rating', {
          bookingId: bookingToRate.BookingId,
          rating: Number(rating),
          comment: ratingComment.trim(),
          images: ratingImageDataUrls,
        })
      }

      await refresh().catch(() => {})
      closeRatingModal()
      setResultTitle('Successfully!')
      setResultMessage(
        ratingTarget === 'service'
          ? 'Service review submitted. This will override booking review for that service.'
          : 'Booking review submitted successfully.',
      )
      setResultModalOpen(true)
    } catch (err) {
      setResultTitle('Error')
      setResultMessage(err?.message || 'Failed to submit rating')
      setResultModalOpen(true)
    } finally {
      setSubmittingRating(false)
    }
  }

  if (loading) return <div className="loading">Loading booking history...</div>
  if (error) return <div className="error">{error}</div>

  const handleRatingImageChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const toDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

    try {
      const dataUrls = await Promise.all(files.map((file) => toDataUrl(file)))
      setRatingImageDataUrls((prev) => {
        const merged = [...prev, ...dataUrls.filter(Boolean)]
        const unique = Array.from(new Set(merged))
        return unique.slice(0, 3)
      })
    } catch (_err) {
      alert('Failed to read selected image files')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="history-page">
      <div className="history-container">
        <div className="history-head">
          <div>
            <h2 className="history-title"><IoCalendarOutline /> Booking History</h2>
            <p className="history-subtitle">Track all appointments and cancel pending ones quickly.</p>
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
                      <p className="history-kv-label">Discount</p>
                      <p className="history-kv-value">- {fmtMoney(booking.DiscountAmount || 0)}</p>
                    </div>
                    <div className="history-kv">
                      <p className="history-kv-label">Total Price</p>
                      <p className="history-kv-value">{fmtMoney(booking.TotalPrice || 0)}</p>
                    </div>
                  </div>

                  <div className="history-items">
                    <table className="history-items-table booking-items-table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Duration</th>
                          <th>Price</th>
                          <th>Discount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.length === 0 ? (
                          <tr>
                            <td colSpan={4}>No service detail</td>
                          </tr>
                        ) : (
                          services.map((service) => (
                            <tr key={service.BookingServiceId || `${booking.BookingId}-${service.ServiceId}`}>
                              <td>{service.ServiceName || service.ServiceId}</td>
                              <td>{Number(service.DurationMinutes || 0)} mins</td>
                              <td>{fmtMoney(service.Price || 0)}</td>
                              <td>{formatVnd(0)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}><strong>Subtotal</strong></td>
                          <td><strong>{fmtMoney(booking.Subtotal || booking.TotalPrice || 0)}</strong></td>
                          <td><strong>- {fmtMoney(booking.DiscountAmount || 0)}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {isPending(booking.Status) ? (
                    <div className="history-actions">
                      <button
                        className="history-cancel-btn"
                        disabled={cancellingId === booking.BookingId}
                        onClick={() => handleCancel(booking)}
                      >
                        {cancellingId === booking.BookingId ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    </div>
                  ) : isCompleted(booking.Status) ? (
                    <div className="history-actions">
                      <button
                        className="history-rate-btn"
                        onClick={() => openRatingModal(booking)}
                      >
                        {booking?.IsRated ? 'Review / Override Services' : 'Review'}
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>

      <PortalModal
        open={ratingModalOpen}
        title="Rate Booking"
        onClose={closeRatingModal}
        footer={
          <>
            <button type="button" className="portal-modalBtn" onClick={closeRatingModal}>
              Cancel
            </button>
            <button 
              type="button" 
              className="portal-modalBtn portal-modalBtnPrimary" 
              onClick={submitRating}
              disabled={submittingRating}
            >
              {submittingRating ? 'Submitting...' : 'Submit Review'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Review Type
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                className={`portal-modalBtn history-reviewTypeBtn ${ratingTarget === 'booking' ? 'is-active' : ''}`}
                onClick={() => setRatingTarget('booking')}
              >
                Whole Booking
              </button>
              <button
                type="button"
                className={`portal-modalBtn history-reviewTypeBtn ${ratingTarget === 'service' ? 'is-active' : ''}`}
                onClick={() => setRatingTarget('service')}
                disabled={!Array.isArray(bookingToRate?.Services) || bookingToRate.Services.length === 0}
              >
                Specific Service
              </button>
            </div>

            {ratingTarget === 'service' ? (
              <select
                value={selectedBookingServiceId}
                onChange={(e) => setSelectedBookingServiceId(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0 10px',
                  fontSize: '14px',
                  color: '#111827',
                }}
              >
                {(Array.isArray(bookingToRate?.Services) ? bookingToRate.Services : []).map((service) => (
                  <option key={service.BookingServiceId} value={service.BookingServiceId}>
                    {service.ServiceName || service.ServiceId || service.BookingServiceId}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Rating
            </label>
            <div style={{ display: 'flex', gap: '8px', fontSize: '28px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    cursor: 'pointer',
                    color: star <= rating ? '#fbbf24' : '#d1d5db',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Your Comment (Optional)
            </label>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder={ratingTarget === 'service'
                ? 'Share your experience with this service...'
                : 'Share your experience with this booking...'}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', display: 'block' }}>
              Images (Optional, up to 3)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={handleRatingImageChange}
              style={{
                width: '100%',
                padding: '8px 0',
                fontSize: '14px',
              }}
            />
            {ratingImageDataUrls.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {ratingImageDataUrls.map((img, index) => (
                  <img
                    key={`${img.slice(0, 30)}-${index}`}
                    src={img}
                    alt={`Selected rating ${index + 1}`}
                    style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </PortalModal>

      <PortalModal
        open={resultModalOpen}
        title={resultTitle}
        onClose={() => setResultModalOpen(false)}
      >
        <p style={{ 
          fontSize: '15px', 
          color: '#1f2937', 
          marginBottom: '12px', 
          lineHeight: '1.6',
          fontWeight: '500'
        }}>
          {resultMessage}
        </p>
      </PortalModal>
    </section>
  )
}

export default BookingHistoryPage
