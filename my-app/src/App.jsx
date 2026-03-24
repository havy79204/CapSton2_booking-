import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import OwnerPortalLayout from './components/Layout portal/OwnerPortalLayout.jsx'
import OwnerDashboardPage from './pages/portals/OwnerDashboardPage.jsx'
import OwnerAppointmentsPage from './pages/portals/OwnerAppointmentsPage.jsx'
import OwnerSchedulePage from './pages/portals/OwnerSchedulePage.jsx'
import OwnerStaffPage from './pages/portals/OwnerStaffPage.jsx'
import OwnerServicesPage from './pages/portals/OwnerServicesPage.jsx'
import OwnerInventoryPage from './pages/portals/OwnerInventoryPage.jsx'
import OwnerProductsPage from './pages/portals/OwnerProductsPage.jsx'
import OwnerOrdersPage from './pages/portals/OwnerOrdersPage.jsx'
import OwnerCustomersPage from './pages/portals/OwnerCustomersPage.jsx'
import OwnerReportsPage from './pages/portals/OwnerReportsPage.jsx'
import OwnerSettingsPage from './pages/portals/OwnerSettingsPage.jsx'
import OwnerNotificationsPage from './pages/portals/OwnerNotificationsPage.jsx'
import OwnerChatPage from './pages/portals/OwnerChatPage.jsx'
import OwnerCustomerDetailPage from './pages/portals/OwnerCustomerDetailPage.jsx'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import HomePage from './pages/HomePage.jsx'
import ServiceDetail from './pages/ServiceDetail.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import CartPage from './pages/CartPage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import BookingHistoryPage from './pages/BookingHistoryPage.jsx'
import NotificationPage from './pages/NotificationPage.jsx'
import OrderHistoryPage from './pages/OrderHistoryPage.jsx'
import ServiceCatalogPage from './pages/ServiceCatalogPage.jsx'
import ProductCatalogPage from './pages/ProductCatalogPage.jsx'
import './App.css'

import { getToken } from './lib/auth.js'

function RequireAuth({ children }) {
  const token = getToken()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function CustomerLayout() {
  return (
    <div className="app">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/portals/owner/services/:id"
        element={
          <RequireAuth>
            <ServiceDetail ownerMode />
          </RequireAuth>
        }
      />

      <Route
        path="/portals/owner/products/:id"
        element={
          <RequireAuth>
            <ProductDetail ownerMode />
          </RequireAuth>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <CustomerLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="service/:id" element={<ServiceDetail />} />
        <Route path="product/:id" element={<ProductDetail />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="bookings" element={<BookingHistoryPage />} />
        <Route path="booking-history" element={<BookingHistoryPage />} />
        <Route path="notifications" element={<NotificationPage />} />
        <Route path="orders" element={<OrderHistoryPage />} />
        <Route path="order-history" element={<OrderHistoryPage />} />
        <Route path="services" element={<ServiceCatalogPage />} />
        <Route path="shop" element={<ProductCatalogPage />} />
      </Route>

      <Route
        path="/portals/owner"
        element={
          <RequireAuth>
            <OwnerPortalLayout />
          </RequireAuth>
        }
      >
        <Route path="dashboard" element={<OwnerDashboardPage />} />
        <Route path="appointments" element={<OwnerAppointmentsPage />} />
        <Route path="schedule" element={<OwnerSchedulePage />} />
        <Route path="staff" element={<OwnerStaffPage />} />
        <Route path="services" element={<OwnerServicesPage />} />
        <Route path="inventory" element={<OwnerInventoryPage />} />
        <Route path="products" element={<OwnerProductsPage />} />
        <Route path="orders" element={<OwnerOrdersPage />} />
        <Route path="customers" element={<OwnerCustomersPage />} />
        <Route path="customers/:customerId" element={<OwnerCustomerDetailPage />} />
        <Route path="reports" element={<OwnerReportsPage />} />
        <Route path="settings" element={<OwnerSettingsPage />} />
        <Route path="notifications" element={<OwnerNotificationsPage />} />
        <Route path="chat" element={<OwnerChatPage />} />
        <Route index element={<Navigate to="/portals/owner/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
