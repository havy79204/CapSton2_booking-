import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  FiArrowLeft,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiPhone,
  FiUser,
} from 'react-icons/fi'
import { api } from '../lib/api.js'
import { setToken } from '../lib/auth.js'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1671763903993-39702e43f5d2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080'

function normalizeRoleKey(value) {
  if (value === undefined || value === null) return NaN

  const num = Number(value)
  if (Number.isFinite(num)) {
    const asInt = Math.trunc(num)
    if ([1, 2, 3].includes(asInt)) return asInt
  }

  const text = String(value).trim().toLowerCase()
  if (text === '1' || text === 'admin' || text === 'owner') return 1
  if (text === '2' || text === 'staff') return 2
  if (text === '3' || text === 'customer') return 3
  return NaN
}

function HeroImage({ src, alt }) {
  const [failed, setFailed] = React.useState(false)

  if (failed) {
    return <div className="auth-heroFallback" role="img" aria-label={alt} />
  }

  return (
    <img
      src={src}
      alt={alt}
      className="auth-heroImage"
      onError={() => setFailed(true)}
    />
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = React.useState('login')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [success, setSuccess] = React.useState('')

  const [loginForm, setLoginForm] = React.useState({ email: '', password: '' })
  const [signupForm, setSignupForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [forgotForm, setForgotForm] = React.useState({
    email: '',
    code: '',
    newPassword: '',
  })
  const [forgotCodeSent, setForgotCodeSent] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  const verifyToken = React.useMemo(() => {
    const params = new URLSearchParams(location.search || '')
    return String(params.get('verifyToken') || '').trim()
  }, [location.search])

  const routeMode = React.useMemo(() => {
    const path = String(location.pathname || '').toLowerCase()
    if (path.includes('signup') || path.includes('register')) return 'signup'
    if (path.includes('forgot')) return 'forgot'
    return 'login'
  }, [location.pathname])

  React.useEffect(() => {
    setMode(routeMode)
    setError('')
    setSuccess('')
    if (routeMode !== 'forgot') setForgotCodeSent(false)
  }, [routeMode])

  React.useEffect(() => {
    if (!verifyToken) return

    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')
        await api.post('/api/auth/verify-email', { token: verifyToken })
        if (cancelled) return
        setSuccess('Your account has been activated successfully. You can now log in.')
        navigate('/login', { replace: true })
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Verification link is invalid or expired.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [verifyToken, navigate])

  const handleLogin = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const email = String(loginForm.email || '').trim()
    const password = String(loginForm.password || '')

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    try {
      setLoading(true)
      const result = await api.post('/api/auth/login', { email, password })
      const token = result?.token || ''
      const user = result?.user || {}
      if (!token) throw new Error('Login token is missing')

      setToken(token)
      const rk = normalizeRoleKey(user?.roleKey ?? user?.role)
      if (rk === 1) {
        navigate('/portals/owner', { replace: true })
      } else if (rk === 2) {
        navigate('/portals/staff', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const name = String(signupForm.name || '').trim()
    const email = String(signupForm.email || '').trim()
    const phone = String(signupForm.phone || '').trim()
    const password = String(signupForm.password || '')
    const confirmPassword = String(signupForm.confirmPassword || '')

    if (!name || !email || !password) {
      setError('Please fill in name, email and password.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    try {
      setLoading(true)
      await api.post('/api/auth/signup', { name, email, phone, password })
      setSuccess('Verification email sent. Please activate your account within 5 minutes.')
      setSignupForm({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err?.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotSendCode = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const email = String(forgotForm.email || '').trim()
    if (!email) {
      setError('Please enter your email.')
      return
    }

    try {
      setLoading(true)
      await api.post('/api/auth/forgot-password', { email })
      setForgotCodeSent(true)
      setSuccess('Reset code has been sent to your email.')
    } catch (err) {
      setError(err?.message || 'Failed to send reset code')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const email = String(forgotForm.email || '').trim()
    const code = String(forgotForm.code || '').trim()
    const newPassword = String(forgotForm.newPassword || '')

    if (!email || !code || !newPassword) {
      setError('Please enter email, code and new password.')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    try {
      setLoading(true)
      await api.post('/api/auth/reset-password', { email, code, newPassword })
      setSuccess('Password has been reset. Please log in with your new password.')
      setForgotCodeSent(false)
      setForgotForm({ email: '', code: '', newPassword: '' })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err?.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const heroCopy = {
    login: {
      title: 'Join Us Today',
      subtitle: 'Your beauty journey starts here',
    },
    signup: {
      title: 'Join Us Today',
      subtitle: 'Create an account and discover endless beauty possibilities',
    },
    forgot: {
      title: 'Forgot Password?',
      subtitle: "Don't worry, we'll help you reset it",
    },
  }

  const formCopy = {
    login: {
      title: 'Welcome Back',
      subtitle: 'Sign in to book your next appointment',
    },
    signup: {
      title: 'Create Account',
      subtitle: 'Sign up to start booking your appointments',
    },
    forgot: {
      title: 'Reset Password',
      subtitle: "Enter your email address and we'll send you instructions to reset your password",
    },
  }

  const hero = heroCopy[mode] || heroCopy.login
  const formHeader = formCopy[mode] || formCopy.login

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <HeroImage src={HERO_IMAGE} alt="Luxury nail salon" />
        <div className="auth-heroOverlay" />
        <div className="auth-heroContent">
          <h1 className="auth-heroTitle">{hero.title}</h1>
          <p className="auth-heroSubtitle">{hero.subtitle}</p>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          {mode === 'forgot' && !forgotCodeSent ? (
            <Link to="/login" className="auth-backLink">
              <FiArrowLeft />
              Back to login
            </Link>
          ) : null}

          <div className="auth-header">
            <h2>{formHeader.title}</h2>
            <p>{formHeader.subtitle}</p>
          </div>

          {error || success ? (
            <div className={`auth-alert ${error ? 'is-error' : 'is-success'}`}>
              {error || success}
            </div>
          ) : null}

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="auth-inputWrap">
                <FiMail className="auth-inputIcon" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="email"
                />
              </div>

              <label className="auth-label" htmlFor="login-password">
                Password
              </label>
              <div className="auth-inputWrap">
                <FiLock className="auth-inputIcon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-inputAction"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              <div className="auth-row">
                <label className="auth-checkbox">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
                <Link to="/forgot-password" className="auth-link">
                  Forgot password?
                </Link>
              </div>

              <button type="submit" className="auth-primaryBtn" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <p className="auth-footer">
                Don't have an account? <Link to="/signup">Sign up now</Link>
              </p>
            </form>
          ) : null}

          {mode === 'signup' ? (
            <form className="auth-form" onSubmit={handleSignup}>
              <label className="auth-label" htmlFor="signup-name">
                Full Name
              </label>
              <div className="auth-inputWrap">
                <FiUser className="auth-inputIcon" />
                <input
                  id="signup-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={signupForm.name}
                  onChange={(e) => setSignupForm((p) => ({ ...p, name: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="name"
                />
              </div>

              <label className="auth-label" htmlFor="signup-email">
                Email Address
              </label>
              <div className="auth-inputWrap">
                <FiMail className="auth-inputIcon" />
                <input
                  id="signup-email"
                  type="email"
                  placeholder="your@email.com"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm((p) => ({ ...p, email: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="email"
                />
              </div>

              <label className="auth-label" htmlFor="signup-phone">
                Phone Number
              </label>
              <div className="auth-inputWrap">
                <FiPhone className="auth-inputIcon" />
                <input
                  id="signup-phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={signupForm.phone}
                  onChange={(e) => setSignupForm((p) => ({ ...p, phone: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="tel"
                />
              </div>

              <label className="auth-label" htmlFor="signup-password">
                Password
              </label>
              <div className="auth-inputWrap">
                <FiLock className="auth-inputIcon" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  value={signupForm.password}
                  onChange={(e) => setSignupForm((p) => ({ ...p, password: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-inputAction"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              <label className="auth-label" htmlFor="signup-confirm">
                Confirm Password
              </label>
              <div className="auth-inputWrap">
                <FiLock className="auth-inputIcon" />
                <input
                  id="signup-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={signupForm.confirmPassword}
                  onChange={(e) => setSignupForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  disabled={loading}
                  className="auth-input"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-inputAction"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>

              <label className="auth-checkbox">
                <input type="checkbox" />
                <span>
                  I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
                  <Link to="/privacy">Privacy Policy</Link>
                </span>
              </label>

              <button type="submit" className="auth-primaryBtn" disabled={loading}>
                {loading ? 'Submitting...' : 'Create Account'}
              </button>

              <p className="auth-footer">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <form
              className="auth-form"
              onSubmit={forgotCodeSent ? handleResetPassword : handleForgotSendCode}
            >
              {!forgotCodeSent ? (
                <>
                  <label className="auth-label" htmlFor="forgot-email">
                    Email Address
                  </label>
                  <div className="auth-inputWrap">
                    <FiMail className="auth-inputIcon" />
                    <input
                      id="forgot-email"
                      type="email"
                      placeholder="your@email.com"
                      value={forgotForm.email}
                      onChange={(e) => setForgotForm((p) => ({ ...p, email: e.target.value }))}
                      disabled={loading}
                      className="auth-input"
                      autoComplete="email"
                    />
                  </div>

                  <button type="submit" className="auth-primaryBtn" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Code'}
                  </button>

                  <p className="auth-footer">
                    Don't have an account? <Link to="/signup">Sign up now</Link>
                  </p>
                </>
              ) : (
                <>
                  <div className="auth-successState">
                    <div className="auth-successIcon">
                      <FiCheckCircle />
                    </div>
                    <div>
                      <h3>Check Your Email</h3>
                      <p>
                        We've sent a reset code to your email address. Please enter it below to
                        reset your password.
                      </p>
                    </div>
                  </div>

                  <label className="auth-label" htmlFor="forgot-code">
                    Verification Code
                  </label>
                  <div className="auth-inputWrap">
                    <FiCheckCircle className="auth-inputIcon" />
                    <input
                      id="forgot-code"
                      type="text"
                      placeholder="Enter the code"
                      value={forgotForm.code}
                      onChange={(e) => setForgotForm((p) => ({ ...p, code: e.target.value }))}
                      disabled={loading}
                      className="auth-input"
                    />
                  </div>

                  <label className="auth-label" htmlFor="forgot-password">
                    New Password
                  </label>
                  <div className="auth-inputWrap">
                    <FiLock className="auth-inputIcon" />
                    <input
                      id="forgot-password"
                      type="password"
                      placeholder="Create a new password"
                      value={forgotForm.newPassword}
                      onChange={(e) => setForgotForm((p) => ({ ...p, newPassword: e.target.value }))}
                      disabled={loading}
                      className="auth-input"
                      autoComplete="new-password"
                    />
                  </div>

                  <button type="submit" className="auth-primaryBtn" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>

                  <div className="auth-hintBox">
                    <strong>Didn't receive the email?</strong>
                    <span>
                      Check your spam folder or{' '}
                      <button type="button" onClick={() => setForgotCodeSent(false)}>
                        try again
                      </button>
                      .
                    </span>
                  </div>

                  <Link to="/login" className="auth-primaryBtn auth-primaryBtnOutline">
                    <FiArrowLeft />
                    Back to Login
                  </Link>
                </>
              )}
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}