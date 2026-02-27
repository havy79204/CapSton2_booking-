import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { BookingProvider } from './context/BookingContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { ScheduleProvider } from './context/ScheduleContext.jsx'
import { InventoryProvider } from './context/InventoryContext.jsx'
import { I18nProvider } from './context/I18nContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <BookingProvider>
            <CartProvider>
              <ScheduleProvider>
                <InventoryProvider>
                  <App />
                </InventoryProvider>
              </ScheduleProvider>
            </CartProvider>
          </BookingProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
