import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingBag, CalendarCheck, LogIn, LogOut, Sparkles, User, Bell, Globe2 } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'

import logo from '../assets/images/image.png'

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
  const { lang, t, setLanguage } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const hidePrimaryNavPaths = ['/search', '/notifications', '/cart']
  const hidePrimaryNav = hidePrimaryNavPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))

  const [showProfile, setShowProfile] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [profileForm, setProfileForm] = useState({ name: '', email: '' })
  const [pwdForm, setPwdForm] = useState({ current: '', next: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  function goHome(e) {
    e.preventDefault()
    navigate('/')
  }

  function openProfile() {
    setProfileForm({
      name: auth.user?.name || '',
      email: auth.user?.email || '',
    })
    setPwdForm({ current: '', next: '' })
    setActiveTab('profile')
    setStatusMsg('')
    setErrorMsg('')
    setShowProfile(true)
    setShowProfileMenu(false)
  }

  function closeProfile() {
    setShowProfile(false)
    setShowProfileMenu(false)
  }

  async function saveProfile(e) {
    e?.preventDefault()
    setSavingProfile(true)
    setStatusMsg('')
    setErrorMsg('')
    try {
      await auth.updateProfile(profileForm)
      setStatusMsg(t('profile.success', 'Updated successfully'))
    } catch (err) {
      setErrorMsg(err?.message || t('portal.common.error', 'Error'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e) {
    e?.preventDefault()
    setSavingPwd(true)
    setStatusMsg('')
    setErrorMsg('')
    try {
      await auth.changePassword({ currentPassword: pwdForm.current, newPassword: pwdForm.next })
      setStatusMsg(t('profile.passwordSuccess', 'Password updated'))
      setPwdForm({ current: '', next: '' })
    } catch (err) {
      setErrorMsg(err?.message || t('portal.common.error', 'Error'))
    } finally {
      setSavingPwd(false)
    }
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
      <header className="topbar">
        <div className="container topbarInner">
          {/* Top Row: Logo, Navigation (center), Account Actions (right) */}
          <div className="topbarRow topRow">
            <a className="brand" href="/" onClick={goHome}>
              <div className="brandTitle">
                <strong>{t('brand.title', 'NIOM&CE')}</strong>
                <span>{t('brand.subtitle', 'Nail Booking • Shop')}</span>
              </div>
            </a>
            
            {/* Main Navigation - Center */}
            {!hidePrimaryNav && (
              <nav className="nav" aria-label="Primary">
                <NavItem to="/">{t('nav.home', 'Home')}</NavItem>
                <NavItem to="/salons">{t('nav.salons', 'Salons')}</NavItem>
                <NavItem to="/shop">{t('nav.shop', 'Shop')}</NavItem>
                <NavItem to="/booking">{t('nav.booking', 'Book')}</NavItem>
                <NavItem
                  to="/messages"
                  onClick={(e) => {
                    if (auth.isAuthed) return
                    e.preventDefault()
                    navigate('/login', { state: { from: '/messages', reason: 'messages' } })
                  }}
                >
                  {t('nav.messages', 'Messages')}
                </NavItem>
              </nav>
            )}
            
            <div className="actionsTop">
              <button className="linkBtn" onClick={() => navigate('/search')}>
                <span>{t('nav.search', 'Tìm kiếm')}</span>
              </button>
              <button className="linkBtn" onClick={() => navigate('/notifications')}>
                <Bell size={16} />
                <span>{t('nav.notifications', 'Alerts')}</span>
              </button>
              <button className="linkBtn" onClick={() => navigate('/cart')}>
                <ShoppingBag size={16} />
                <span>{t('nav.cart', 'Giỏ hàng')} ({cart.count()})</span>
              </button>
              
              <div className="profileMenu">
                <button 
                  className="linkBtn" 
                  onClick={() => setShowProfileMenu((v) => !v)}
                >
                  <User size={16} />
                  <span>{auth.isAuthed ? auth.user?.name : t('nav.account', 'Account')}</span>
                </button>
                
                {showProfileMenu && (
                  <div className="profileMenuDropdown">
                    <button
                      type="button"
                      className="menuItem"
                      onClick={() => {
                        setLanguage(lang === 'vi' ? 'en' : 'vi')
                        setShowProfileMenu(false)
                      }}
                    >
                    </button>
                    
                    {auth.isAuthed ? (
                      <>
                        <button type="button" className="menuItem" onClick={openProfile}>
                          <User size={16} />
                          {t('nav.profile', 'Thông tin cá nhân')}
                        </button>
                        <button type="button" className="menuItem" onClick={() => { auth.logout(); setShowProfileMenu(false); }}>
                          <LogOut size={16} />
                          {t('nav.logout', 'Đăng xuất')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="menuItem" onClick={() => { navigate('/login'); setShowProfileMenu(false); }}>
                          <LogIn size={16} />
                          {t('auth.login', 'Login')}
                        </button>
                        <button type="button" className="menuItem" onClick={() => { navigate('/signup'); setShowProfileMenu(false); }}>
                          <User size={16} />
                          {t('auth.signup', 'Sign Up')}
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
                  <span>{t('nav.forBusiness', 'For Business')}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className={mainClass}>
        <Outlet />
      </main>

      {showProfile ? (
        <div className="profileOverlay" onClick={closeProfile}>
          <div className="profileModal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{t('profile.title', 'Your account')}</div>
                <div className="muted" style={{ fontSize: 13 }}>{auth.user?.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="pill"
                  type="button"
                  onClick={() => setLanguage(lang === 'vi' ? 'en' : 'vi')}
                >
                  <Globe2 size={16} />
                </button>
                <button className="btn" onClick={closeProfile}>
                  {t('profile.close', 'Close')}
                </button>
              </div>
            </div>

            <div className="tabRow">
              <button
                type="button"
                className={activeTab === 'profile' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('profile')}
              >
                {t('profile.tab.info', 'Profile')}
              </button>
              <button
                type="button"
                className={activeTab === 'password' ? 'tab active' : 'tab'}
                onClick={() => setActiveTab('password')}
              >
                {t('profile.tab.password', 'Change password')}
              </button>
            </div>

            {activeTab === 'profile' ? (
              <form className="formGrid" onSubmit={saveProfile}>
                <label>
                  <div className="searchLabel">{t('profile.name', 'Full name')}</div>
                  <input
                    className="input"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t('profile.namePlaceholder', 'Enter full name')}
                  />
                </label>
                <label>
                  <div className="searchLabel">{t('profile.email', 'Email')}</div>
                  <input
                    className="input"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder={t('profile.emailPlaceholder', 'you@example.com')}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                  {savingProfile ? t('profile.saving', 'Saving…') : t('profile.save', 'Save changes')}
                </button>
              </form>
            ) : (
              <form className="formGrid" onSubmit={changePassword}>
                <label>
                  <div className="searchLabel">{t('profile.currentPassword', 'Current password')}</div>
                  <input
                    className="input"
                    type="password"
                    value={pwdForm.current}
                    onChange={(e) => setPwdForm((p) => ({ ...p, current: e.target.value }))}
                    placeholder="••••••••"
                  />
                </label>
                <label>
                  <div className="searchLabel">{t('profile.newPassword', 'New password')}</div>
                  <input
                    className="input"
                    type="password"
                    value={pwdForm.next}
                    onChange={(e) => setPwdForm((p) => ({ ...p, next: e.target.value }))}
                    placeholder={t('profile.newPasswordPlaceholder', 'At least 8 characters with letters and numbers')}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={savingPwd}>
                  {savingPwd ? t('profile.passwordSaving', 'Updating…') : t('profile.changePassword', 'Change password')}
                </button>
              </form>
            )}

            {(statusMsg || errorMsg) ? (
              <div className={errorMsg ? 'badge badgeError' : 'badge badgeSuccess'} style={{ marginTop: 12 }}>
                {errorMsg || statusMsg}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isSearch && (
        <footer className="footer">
          <div className="container">
            <div className="footerGrid">
              <div>
                <h3 className="footerTitle">NIOM&CE</h3>
                <div className="muted">
                  Premium booking + shopping in one place.
                  Fast scheduling, clear services, curated products — saved right in your browser.
                </div>
              </div>
              <div>
                <h3 className="footerTitle">Links</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href="/booking" onClick={(e) => (e.preventDefault(), navigate('/booking'))}>
                    Book
                  </a>
                  <a href="/shop" onClick={(e) => (e.preventDefault(), navigate('/shop'))}>
                    Shop
                  </a>
                  <a href="/gallery" onClick={(e) => (e.preventDefault(), navigate('/gallery'))}>
                    Gallery
                  </a>
                </div>
              </div>
              <div>
                <h3 className="footerTitle">Support</h3>
                <div className="muted">Email: vupham.190504@gmail.com</div>
                <div className="muted">Phone: +84 0898197946</div>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
