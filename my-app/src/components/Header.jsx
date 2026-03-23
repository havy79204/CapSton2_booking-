import { Link, useNavigate } from 'react-router-dom';
import { IoNotificationsOutline, IoCartOutline, IoPersonOutline } from 'react-icons/io5';
import { useState, useRef, useEffect } from 'react'
import { api, resolveApiImageUrl } from '../lib/api';
import { clearToken } from '../lib/auth';
import { useAuthMe } from '../hooks/useAuthMe';
import { notifyAuthMeUpdated } from '../hooks/useAuthMe';
import { useCustomerCart } from '../hooks/useCustomerCommerce';
import { useNotifications } from '../hooks/useNotifications';
import '../styles/Header.css';

const Header = () => {
  const { me } = useAuthMe();
  const { cart } = useCustomerCart();
  const { unreadCount: notificationCount } = useNotifications();

  const avatarBaseSrc = resolveApiImageUrl(me?.avatarUrl);
  const avatarSrc = avatarBaseSrc
    ? `${avatarBaseSrc}${avatarBaseSrc.includes('?') ? '&' : '?'}v=${me?._avatarVersion || 1}`
    : '';

  // Calculate total items in cart
  const cartItems = Array.isArray(cart?.Items) ? cart.Items : [];
  const cartCount = cartItems.reduce((sum, item) => sum + Number(item.Quantity || 0), 0);

  const handleNavigation = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const handleProfileClick = (e) => {
    if (e?.target?.closest('.profile-menu')) return
    e.preventDefault()
    setMenuOpen((v) => !v)
  }

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore API logout failure and clear client token anyway
    }

    clearToken()
    notifyAuthMeUpdated(null)
    setMenuOpen(false)
    navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo" onClick={handleNavigation}>
          <h1>NIOM&CE</h1>
        </Link>
        <div className="header-actions">
          <Link to="/booking" className="booking-btn" onClick={handleNavigation}>
            BOOKING
          </Link>
          <Link to="/notifications" className="icon-btn notification" onClick={handleNavigation}>
            <IoNotificationsOutline />
            {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
          </Link>
          <Link to="/cart" className="icon-btn cart" onClick={handleNavigation}>
            <IoCartOutline />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </Link>
          <div className="icon-btn profile" onClick={handleProfileClick} ref={menuRef} role="button" tabIndex={0}>
            {avatarSrc && !avatarFailed ? (
              <img
                className="header-avatar"
                src={avatarSrc}
                alt={me?.name || 'Profile'}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <IoPersonOutline />
            )}

            {menuOpen ? (
              <div className="profile-menu">
                {me ? (
                  <>
                    <button type="button" onClick={() => { setMenuOpen(false); navigate('/profile') }}>Profile</button>
                    <button type="button" onClick={handleLogout}>Logout</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setMenuOpen(false); navigate('/login') }}>Login</button>
                    <button type="button" onClick={() => { setMenuOpen(false); navigate('/register') }}>Sign Up</button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
