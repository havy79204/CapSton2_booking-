import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingCart, CalendarCheck, LogIn, LogOut, Sparkles, User, Bell, MessageCircle, Facebook, Instagram, Menu, X } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { CartDropdown } from './CartDropdown.jsx'
import { NotificationDropdown } from './NotificationDropdown.jsx'

function NavItem({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
      end={to === '/'}
      onClick={onClick}
    >
      {children}
    </NavLink>
  )
}

export function AppLayout() {
  const cart = useCart()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const hidePrimaryNavPaths = ['/search', '/notifications', '/cart']
  const hidePrimaryNav = hidePrimaryNavPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showCartDropdown, setShowCartDropdown] = useState(false)
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Mock notifications - replace with real API data
  const [notifications] = useState([
    {
      id: 1,
      title: 'Booking Confirmed',
      message: 'Your appointment at ZAny Kingston is confirmed for tomorrow at 2:00 PM',
      time: '2 hours ago',
      read: false,
      type: 'booking'
    },
    {
      id: 2,
      title: 'Special Offer',
      message: '20% off on all services this weekend!',
      time: '5 hours ago',
      read: false,
      type: 'promotion'
    },
    {
      id: 3,
      title: 'Order Shipped',
      message: 'Your order #1234 has been shipped',
      time: '1 day ago',
      read: true,
      type: 'order'
    }
  ])

  const cartCount = cart.count()
  const unreadCount = notifications.filter(n => !n.read).length

  // Close mobile menu when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && showMobileMenu) {
        setShowMobileMenu(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [showMobileMenu])

  // Close mobile menu when route changes
  useEffect(() => {
    setShowMobileMenu(false)
  }, [location.pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showMobileMenu])

  function goHome(e) {
    e.preventDefault()
    navigate('/')
  }

  function openProfile() {
    navigate('/profile')
    setShowProfileMenu(false)
  }

  const isSearch = location.pathname === '/search' || location.pathname.startsWith('/search/')
  const isNotifications = location.pathname === '/notifications' || location.pathname.startsWith('/notifications/')
  const isCart = location.pathname === '/cart' || location.pathname.startsWith('/cart/')
  let mainClass = (location.pathname === '/' || hidePrimaryNav) ? 'main mainHero' : 'main'
  if (isSearch) mainClass += ' page-search'
  if (isNotifications) mainClass += ' page-notifications'
  if (isCart) mainClass += ' page-cart'

  return (
    <div className="appShell">
      {/* Mobile Menu Backdrop */}
      {showMobileMenu && (
        <div 
          className="mobileMenuBackdrop" 
          onClick={() => setShowMobileMenu(false)}
        />
      )}
      
      <header className="topbar">
        <div className="container topbarInner">
          {/* Top Row: Logo, Navigation (center), Account Actions (right) */}
          <div className="topbarRow topRow">
            <div className="leftSection">
              <a className="brand" href="/" onClick={goHome}>
                <div className="brandTitle">
                  <strong>NIOM&CE</strong>
                </div>
              </a>
              
              {/* Hamburger Menu Button - Mobile Only */}
              {!hidePrimaryNav && (
                <button 
                  className="hamburgerBtn" 
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  aria-label="Toggle menu"
                >
                  {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
                </button>
              )}
            </div>
            
            {/* Main Navigation - Center */}
            {!hidePrimaryNav && (
              <nav className={`nav ${showMobileMenu ? 'navMobileOpen' : ''}`} aria-label="Primary">
                <NavItem to="/" onClick={() => setShowMobileMenu(false)}>HOME</NavItem>
                <NavItem to="/salons" onClick={() => setShowMobileMenu(false)}>SALONS</NavItem>
                <NavItem to="/shop" onClick={() => setShowMobileMenu(false)}>SHOP</NavItem>
                <button className="navBtn" onClick={() => {
                  setShowMobileMenu(false);
                  const footer = document.querySelector('.footerTop');
                  if (footer) footer.scrollIntoView({ behavior: 'smooth' });
                }}>
                  CONTACT
                </button>
              </nav>
            )}
            
            <div className="actionsTop">
              <button className="btnBooking" onClick={() => navigate('/booking')}>
                BOOKING
              </button>
              
              <div className="notificationMenuWrapper" style={{ position: 'relative' }}>
                <button 
                  className="iconBtn" 
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  onMouseEnter={() => setShowNotificationDropdown(true)}
                >
                  <Bell size={20} />
                  {unreadCount > 0 && <span className="iconBadge">{unreadCount}</span>}
                </button>
                <div onMouseLeave={() => setShowNotificationDropdown(false)}>
                  <NotificationDropdown 
                    isOpen={showNotificationDropdown} 
                    onClose={() => setShowNotificationDropdown(false)}
                    notifications={notifications} 
                  />
                </div>
              </div>
              
              <div className="cartMenuWrapper" style={{ position: 'relative' }}>
                <button 
                  className="iconBtn" 
                  onClick={() => setShowCartDropdown(!showCartDropdown)}
                  onMouseEnter={() => setShowCartDropdown(true)}
                >
                  <ShoppingCart size={20} />
                  {cartCount > 0 && <span className="iconBadge">{cartCount}</span>}
                </button>
                <div onMouseLeave={() => setShowCartDropdown(false)}>
                  <CartDropdown 
                    isOpen={showCartDropdown} 
                    onClose={() => setShowCartDropdown(false)} 
                  />
                </div>
              </div>
              
              <div className="profileMenu">
                <button 
                  className="iconBtn" 
                  onClick={() => setShowProfileMenu((v) => !v)}
                >
                  <User size={20} />
                </button>
                
                {showProfileMenu && (
                  <div className="profileMenuDropdown">
                    {auth.isAuthed ? (
                      <>
                        <button type="button" className="menuItem" onClick={openProfile}>
                          <User size={16} />
                          Profile
                        </button>
                        <button type="button" className="menuItem" onClick={() => { auth.logout(); setShowProfileMenu(false); }}>
                          <LogOut size={16} />
                          Logout
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="menuItem" onClick={() => { navigate('/login'); setShowProfileMenu(false); }}>
                          <LogIn size={16} />
                          Login
                        </button>
                        <button type="button" className="menuItem" onClick={() => { navigate('/signup'); setShowProfileMenu(false); }}>
                          <User size={16} />
                          Sign Up
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {auth.isAuthed && ['admin', 'owner', 'staff'].includes(String(auth.user?.role || '').trim().toLowerCase()) ? (
                <button
                  className="linkBtn"
                  onClick={() => navigate('/portal/dashboard')}
                >
                  <Sparkles size={16} />
                  <span>For Business</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className={mainClass}>
        <Outlet />
      </main>

      {!isSearch && (
        <footer className="footer">
          <div className="container">
            <div className="footerTop">
              <div className="footerBrand">
                <h3 className="footerTitle">NIOM&CE</h3>
              </div>
              
              <div className="footerSection">
                <h4 className="footerSectionTitle">Menu</h4>
                <div className="footerLinks">
                  <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>
                    Home
                  </a>
                  <a href="/salons" onClick={(e) => (e.preventDefault(), navigate('/salons'))}>
                    Salon
                  </a>
                  <a href="/shop" onClick={(e) => (e.preventDefault(), navigate('/shop'))}>
                    Shop
                  </a>
                  <a href="#footer-contact" onClick={(e) => {
                    e.preventDefault();
                    const contact = document.getElementById('footer-contact');
                    if (contact) contact.scrollIntoView({ behavior: 'smooth' });
                  }}>
                    Contact
                  </a>
                </div>
              </div>

              <div className="footerSection" id="footer-contact">
                <h4 className="footerSectionTitle">Contact</h4>
                <div className="footerLinks">
                  <div className="footerContactItem">c2se03@gmail.com</div>
                  <div className="footerContactItem">123.456.7891</div>
                  <div className="footerContactItem">Capstone</div>
                  <div className="footerContactItem">120 Hoàng Minh Thảo, Q. Liên Chiểu,</div>
                  <div className="footerContactItem">Tp. Đà Nẵng</div>
                </div>
              </div>

              <div className="footerSection">
                <h4 className="footerSectionTitle">Social</h4>
                <div className="footerSocial">
                  <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="footerSocialIcon" aria-label="Facebook">
                    <Facebook size={20} />
                  </a>
                  <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="footerSocialIcon" aria-label="TikTok">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </a>
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="footerSocialIcon" aria-label="Instagram">
                    <Instagram size={20} />
                  </a>
                </div>
              </div>
            </div>

            <div className="footerBottom">
              <div className="footerCopyright">C2SE.03</div>
              <div className="footerBottomLinks">
                <a href="/terms" onClick={(e) => e.preventDefault()}>
                  Terms of Use
                </a>
                <a href="/privacy" onClick={(e) => e.preventDefault()}>
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Floating Chat Button */}
      <button
        className="floatingChatBtn"
        onClick={() => {
          if (auth.isAuthed) {
            navigate('/messages')
          } else {
            navigate('/login', { state: { from: '/messages', reason: 'messages' } })
          }
        }}
        title="Messages"
      >
        <MessageCircle size={24} />
      </button>

      {/* Bottom Navigation for Mobile */}
      <nav className="bottomNav">
        <button 
          className="bottomNavItem" 
          onClick={() => navigate('/notifications')}
          title="Notifications"
        >
          <Bell size={22} />
          {unreadCount > 0 && <span className="bottomNavBadge">{unreadCount}</span>}
        </button>
        
        <button 
          className="bottomNavItem" 
          onClick={() => navigate('/cart')}
          title="Cart"
        >
          <ShoppingCart size={22} />
          {cartCount > 0 && <span className="bottomNavBadge">{cartCount}</span>}
        </button>
        
        <button 
          className="bottomNavItem" 
          onClick={() => {
            if (auth.isAuthed) {
              navigate('/profile')
            } else {
              navigate('/login')
            }
          }}
          title="Profile"
        >
          <User size={22} />
        </button>
      </nav>
    </div>
  )
}
