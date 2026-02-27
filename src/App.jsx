import './App.css'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppLayout } from './components/AppLayout.jsx'
import { RequireAuth } from './components/RequireAuth.jsx'
import { HomePage } from './pages/HomePage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import { BookingHistoryPage } from './pages/BookingHistoryPage.jsx'
import { ShopPage } from './pages/ShopPage.jsx'
import { CartPage } from './pages/CartPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { SignupPage } from './pages/SignupPage.jsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx'
import { VerifyEmailPage } from './pages/VerifyEmailPage.jsx'
import { SalonDetailPage } from './pages/SalonDetailPage.jsx'
import { ProductDetailPage } from './pages/ProductDetailPage.jsx'
import { SalonsPage } from './pages/SalonsPage.jsx'
import { GalleryPage } from './pages/GalleryPage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'
import { MessagesPage } from './pages/MessagesPage.jsx'
import { PortalLayout } from './components/PortalLayout.jsx'
import { RequireRole } from './components/RequireRole.jsx'
import { PortalIndexRedirect } from './pages/portal/PortalIndexRedirect.jsx'
import { PortalDashboardPage } from './pages/portal/PortalDashboardPage.jsx'
import { AdminUsersPage } from './pages/portal/AdminUsersPage.jsx'
import { AdminSalonsPage } from './pages/portal/AdminSalonsPage.jsx'
import { AdminPromotionsPage } from './pages/portal/AdminPromotionsPage.jsx'
import { AdminSalonDetailPage } from './pages/portal/AdminSalonDetailPage.jsx'
import { AdminAIReportsPage } from './pages/portal/AdminAIReportsPage.jsx'
import { OwnerStaffPage } from './pages/portal/OwnerStaffPage.jsx'
import { OwnerSalonPage } from './pages/portal/OwnerSalonPage.jsx'
import { OwnerMessagesPage } from './pages/portal/OwnerMessagesPage.jsx'
import { OwnerReviewsPage } from './pages/portal/OwnerReviewsPage.jsx'
import { OwnerSchedulePage } from './pages/portal/OwnerSchedulePage.jsx'
import { OwnerInventoryPage } from './pages/portal/OwnerInventoryPage.jsx'
import { OwnerExternalPOPage } from './pages/portal/OwnerExternalPOPage.jsx'
import { StaffSchedulePage } from './pages/portal/StaffSchedulePage.jsx'
import { StaffTimeClockPage } from './pages/portal/StaffTimeClockPage.jsx'
import { StaffEarningsPage } from './pages/portal/StaffEarningsPage.jsx'
import { PaymentResultPage } from './pages/PaymentResultPage.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route
        path="/portal"
        element={
          <RequireRole allowedRoles={['admin', 'owner', 'staff']} reason="business">
            <PortalLayout />
          </RequireRole>
        }
      >
        <Route index element={<PortalIndexRedirect />} />
        <Route path="dashboard" element={<PortalDashboardPage />} />

        <Route
          path="admin/users"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <AdminUsersPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/salons"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <AdminSalonsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/salons/:id"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <AdminSalonDetailPageKeyed />
            </RequireRole>
          }
        />
        <Route
          path="admin/ai"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <AdminAIReportsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/promotions"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <AdminPromotionsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/security"
          element={
            <RequireRole allowedRoles={['admin']} reason="business">
              <Navigate to="/portal/admin/users" replace />
            </RequireRole>
          }
        />

        <Route
          path="owner/staff"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerStaffPage />
            </RequireRole>
          }
        />
        <Route
          path="owner/salon"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerSalonPage />
            </RequireRole>
          }
        />
        <Route
          path="owner/messages"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerMessagesPage />
            </RequireRole>
          }
        />
        <Route
          path="owner/reviews"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerReviewsPage />
            </RequireRole>
          }
        />
        <Route
          path="owner/schedule"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerSchedulePage />
            </RequireRole>
          }
        />
        <Route
          path="owner/inventory"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerInventoryPage />
            </RequireRole>
          }
        />
        <Route
          path="owner/services"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <Navigate to="/portal/owner/salon?tab=services" replace />
            </RequireRole>
          }
        />
        <Route
          path="owner/bookings"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <Navigate to="/portal/owner/salon?tab=bookings" replace />
            </RequireRole>
          }
        />
        <Route
          path="owner/orders"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <Navigate to="/portal/owner/inventory?tab=orders" replace />
            </RequireRole>
          }
        />
        <Route
          path="owner/external-po"
          element={
            <RequireRole allowedRoles={['owner']} reason="business">
              <OwnerExternalPOPage />
            </RequireRole>
          }
        />

        <Route
          path="staff/schedule"
          element={
            <RequireRole allowedRoles={['staff']} reason="business">
              <StaffSchedulePage />
            </RequireRole>
          }
        />
        <Route
          path="staff/time"
          element={
            <RequireRole allowedRoles={['staff']} reason="business">
              <StaffTimeClockPage />
            </RequireRole>
          }
        />
        <Route
          path="staff/earnings"
          element={
            <RequireRole allowedRoles={['staff']} reason="business">
              <StaffEarningsPage />
            </RequireRole>
          }
        />
      </Route>

      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/salons" element={<SalonsPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route
          path="/messages"
          element={
            <RequireAuth reason="messages">
              <MessagesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/salons/:id"
          element={
            <SalonDetailPageKeyed />
          }
        />
        <Route
          path="/booking"
          element={
            <RequireAuth reason="booking">
              <BookingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings/history"
          element={
            <RequireAuth reason="booking-history">
              <BookingHistoryPage />
            </RequireAuth>
          }
        />
        <Route path="/shop" element={<ShopPage />} />
        <Route
          path="/products/:id"
          element={
            <ProductDetailPageKeyed />
          }
        />
        <Route path="/cart" element={<CartPage />} />
        <Route
          path="/orders"
          element={
            <RequireAuth reason="orders">
              <OrdersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth reason="notifications">
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route path="/payment/vnpay-return" element={<PaymentResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function SalonDetailPageKeyed() {
  const { id } = useParams()
  return <SalonDetailPage key={id} />
}

function ProductDetailPageKeyed() {
  const { id } = useParams()
  return <ProductDetailPage key={id} />
}

function AdminSalonDetailPageKeyed() {
  const { id } = useParams()
  return <AdminSalonDetailPage key={id} />
}

export default App
