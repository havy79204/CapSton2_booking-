import React, { useEffect, useRef, useState } from 'react'
import PortalCard from '../../components/Layout portal/PortalCard.jsx'
import '../../styles/settings.css'
import {
  IconClock,
  IconDollar,
  IconBell,
  IconStore,
  IconSettings,
  IconUser,
} from '../../components/Layout portal/PortalIcons.jsx'
import { api } from '../../lib/api.js'

function PortalSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`portal-switch ${checked ? 'on' : ''}`.trim()}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="portal-switchKnob" aria-hidden="true" />
    </button>
  )
}

export default function OwnerSettingsPage() {
  const [tab, setTab] = useState('salon')

  const [salon, setSalon] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    openTime: '',
    closeTime: '',
  })

  const [profile, setProfile] = useState({
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    avatarUrl: '',
  })

  const avatarInputRef = useRef(null)
  const [profileMsg, setProfileMsg] = useState('')
  const [securityMsg, setSecurityMsg] = useState('')

  const [notify, setNotify] = useState({
    newAppt: true,
    lowStock: true,
    newReview: true,
    dailyReport: false,
    email: true,
  })

  const [pay, setPay] = useState({
    cash: true,
    card: true,
    transfer: true,
  })

  const [bank, setBank] = useState({
    accountNumber: '',
    bankName: '',
  })

  const [twoFA, setTwoFA] = useState(false)

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  function parseBool(v, fallback = false) {
    if (v === undefined || v === null) return fallback
    const s = String(v).toLowerCase().trim()
    return s === 'true' || s === '1' || s === 'yes'
  }

  async function loadSettings() {
    const map = (await api.get('/api/owner/settings')) || {}

    setSalon({
      name: map.SalonName || '',
      phone: map.SalonPhone || '',
      email: map.SalonEmail || '',
      address: map.SalonAddress || '',
      openTime: map.SalonOpenTime || '',
      closeTime: map.SalonCloseTime || '',
    })

    // Prefer logged-in user info from Users table (via JWT), fallback to SystemSettings.
    try {
      const me = await api.get('/api/auth/me')
      setProfile({
        lastName: me?.lastName || map.OwnerLastName || '',
        firstName: me?.firstName || map.OwnerFirstName || '',
        email: me?.email || map.OwnerEmail || '',
        phone: me?.phone || map.OwnerPhone || '',
        avatarUrl: me?.avatarUrl || map.OwnerAvatarUrl || '',
      })
    } catch {
      setProfile({
        lastName: map.OwnerLastName || '',
        firstName: map.OwnerFirstName || '',
        email: map.OwnerEmail || '',
        phone: map.OwnerPhone || '',
        avatarUrl: map.OwnerAvatarUrl || '',
      })
    }

    setNotify({
      newAppt: parseBool(map.NotifyNewAppt, true),
      lowStock: parseBool(map.NotifyLowStock, true),
      newReview: parseBool(map.NotifyNewReview, true),
      dailyReport: parseBool(map.NotifyDailyReport, false),
      email: parseBool(map.NotifyEmail, true),
    })

    setPay({
      cash: parseBool(map.PayCash, true),
      card: parseBool(map.PayCard, true),
      transfer: parseBool(map.PayTransfer, true),
    })

    setBank({
      accountNumber: map.BankAccountNumber || '',
      bankName: map.BankName || '',
    })

    setTwoFA(parseBool(map.TwoFAEnabled, false))
  }

  async function updateSettings(updates) {
    await api.put('/api/owner/settings', { updates })
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await loadSettings()
      } catch (err) {
        if (mounted) console.error(err)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="portal-settings settings-page">
      <div className="portal-settingsTabs">
        <div className="portal-seg" role="tablist" aria-label="Settings tabs">
          <button
            type="button"
            className={`portal-segBtn ${tab === 'salon' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'salon'}
            onClick={() => setTab('salon')}
          >
            Salon Info
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'profile' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'profile'}
            onClick={() => setTab('profile')}
          >
            Personal Profile
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'notify' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'notify'}
            onClick={() => setTab('notify')}
          >
            Notifications
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'payment' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'payment'}
            onClick={() => setTab('payment')}
          >
            Payment
          </button>
          <button
            type="button"
            className={`portal-segBtn ${tab === 'security' ? 'active' : ''}`.trim()}
            role="tab"
            aria-selected={tab === 'security'}
            onClick={() => setTab('security')}
          >
            Security
          </button>
        </div>
      </div>

      {tab === 'salon' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconStore />
            </span>
            <h2 className="portal-settingsSectionText">Salon Info</h2>
          </div>

          <div className="portal-formGrid2">
            <label className="portal-field">
              <span className="portal-label">Salon name</span>
              <input className="portal-input" value={salon.name} onChange={(e) => setSalon((p) => ({ ...p, name: e.target.value }))} />
            </label>

            <label className="portal-field">
              <span className="portal-label">Phone number</span>
              <input className="portal-input" value={salon.phone} onChange={(e) => setSalon((p) => ({ ...p, phone: e.target.value }))} />
            </label>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Email</span>
            <input className="portal-input" value={salon.email} onChange={(e) => setSalon((p) => ({ ...p, email: e.target.value }))} />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Address</span>
            <input className="portal-input" value={salon.address} onChange={(e) => setSalon((p) => ({ ...p, address: e.target.value }))} />
          </label>

          <div className="portal-formGrid2">
            <label className="portal-field">
              <span className="portal-label">Opening time</span>
              <div className="portal-inputWithIcon">
                <input className="portal-input" value={salon.openTime} onChange={(e) => setSalon((p) => ({ ...p, openTime: e.target.value }))} />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconClock />
                </span>
              </div>
            </label>

            <label className="portal-field">
              <span className="portal-label">Closing time</span>
              <div className="portal-inputWithIcon">
                <input className="portal-input" value={salon.closeTime} onChange={(e) => setSalon((p) => ({ ...p, closeTime: e.target.value }))} />
                <span className="portal-inputIcon" aria-hidden="true">
                  <IconClock />
                </span>
              </div>
            </label>
          </div>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={async () => {
                try {
                  await updateSettings({
                    SalonName: salon.name,
                    SalonPhone: salon.phone,
                    SalonEmail: salon.email,
                    SalonAddress: salon.address,
                    SalonOpenTime: salon.openTime,
                    SalonCloseTime: salon.closeTime,
                  })
                  await loadSettings()
                } catch (err) {
                  console.error(err)
                }
              }}
            >
              Save changes
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'profile' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconUser />
            </span>
            <h2 className="portal-settingsSectionText">Personal Profile</h2>
          </div>

          <div className="portal-profileTop">
            <div className="portal-profileAvatar">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '999px' }}
                />
              ) : (
                <span aria-hidden="true">
                  {`${profile.lastName} ${profile.firstName}`
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join('') || 'U'}
                </span>
              )}
            </div>

            <div className="portal-profileUpload">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setProfileMsg('')

                  if (file.size > 2 * 1024 * 1024) {
                    setProfileMsg('Image is too large (max 2MB).')
                    e.target.value = ''
                    return
                  }

                  const reader = new FileReader()
                  reader.onload = () => {
                    const url = String(reader.result || '')
                    // Preview immediately, then upload to backend to get a short URL for DB.
                    setProfile((p) => ({ ...p, avatarUrl: url }))
                    Promise.resolve()
                      .then(async () => {
                        setProfileMsg('Uploading image...')
                        const me = await api.post('/api/auth/me/avatar', { dataUrl: url })
                        const nextUrl = me?.avatarUrl || ''
                        setProfile((p) => ({ ...p, avatarUrl: nextUrl }))
                        setProfileMsg('Image uploaded.')
                      })
                      .catch((err) => {
                        console.error(err)
                        setProfileMsg(err?.message || 'Image upload failed.')
                      })
                      .finally(() => {
                        e.target.value = ''
                      })
                  }
                  reader.onerror = () => {
                    setProfileMsg('Cannot read image file.')
                    e.target.value = ''
                  }
                  reader.readAsDataURL(file)
                }}
              />

              <button
                type="button"
                className="portal-outlineBtn"
                onClick={() => avatarInputRef.current?.click()}
              >
                Change photo
              </button>
              <div className="portal-profileHint">JPG, PNG. Max 2MB</div>
              {profileMsg ? <div className="portal-profileHint" style={{ marginTop: 6 }}>{profileMsg}</div> : null}
            </div>
          </div>

          <div className="portal-settingsDivider" role="separator" />

          <div className="portal-formGrid2">
            <label className="portal-field">
              <span className="portal-label">Last name</span>
              <input className="portal-input" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
            </label>

            <label className="portal-field">
              <span className="portal-label">First name</span>
              <input className="portal-input" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
            </label>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Email</span>
            <input className="portal-input" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Phone number</span>
            <input className="portal-input" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
          </label>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={async () => {
                try {
                  setProfileMsg('')
                  const name = `${profile.lastName} ${profile.firstName}`.trim()
                  try {
                    await api.put('/api/auth/me', {
                      name,
                      email: profile.email,
                      phone: profile.phone,
                      avatarUrl: profile.avatarUrl,
                    })
                  } catch (err) {
                    console.error(err)
                    setProfileMsg(err?.message || 'Failed to update profile.')
                    return
                  }

                  // Keep SystemSettings in sync (used by other settings sections).
                  await updateSettings({
                    OwnerLastName: profile.lastName,
                    OwnerFirstName: profile.firstName,
                    OwnerEmail: profile.email,
                    OwnerPhone: profile.phone,
                    OwnerAvatarUrl: profile.avatarUrl || '',
                  })
                  await loadSettings()
                  setProfileMsg('Profile updated.')
                } catch (err) {
                  console.error(err)
                  setProfileMsg(err?.message || 'Failed to update profile.')
                }
              }}
            >
              Update profile
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'notify' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconBell />
            </span>
            <h2 className="portal-settingsSectionText">Notification Settings</h2>
          </div>

          <div className="portal-settingsList" role="list">
            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">New appointments</div>
                <div className="portal-settingsRowSub">Get notified when a new appointment is created</div>
              </div>
              <PortalSwitch
                label="New appointments"
                checked={notify.newAppt}
                onChange={async (v) => {
                  setNotify((p) => ({ ...p, newAppt: v }))
                  try {
                    await updateSettings({ NotifyNewAppt: v })
                  } catch (err) {
                    console.error(err)
                  }
                }}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Low stock alerts</div>
                <div className="portal-settingsRowSub">Notify when products are running low</div>
              </div>
              <PortalSwitch
                label="Low stock alerts"
                checked={notify.lowStock}
                onChange={async (v) => {
                  setNotify((p) => ({ ...p, lowStock: v }))
                  try {
                    await updateSettings({ NotifyLowStock: v })
                  } catch (err) {
                    console.error(err)
                  }
                }}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">New reviews</div>
                <div className="portal-settingsRowSub">Get notified when a new review is posted</div>
              </div>
              <PortalSwitch
                label="New reviews"
                checked={notify.newReview}
                onChange={async (v) => {
                  setNotify((p) => ({ ...p, newReview: v }))
                  try {
                    await updateSettings({ NotifyNewReview: v })
                  } catch (err) {
                    console.error(err)
                  }
                }}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Daily reports</div>
                <div className="portal-settingsRowSub">Receive end-of-day revenue reports</div>
              </div>
              <PortalSwitch
                label="Daily reports"
                checked={notify.dailyReport}
                onChange={async (v) => {
                  setNotify((p) => ({ ...p, dailyReport: v }))
                  try {
                    await updateSettings({ NotifyDailyReport: v })
                  } catch (err) {
                    console.error(err)
                  }
                }}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Email notifications</div>
                <div className="portal-settingsRowSub">Send notifications by email</div>
              </div>
              <PortalSwitch
                label="Email notifications"
                checked={notify.email}
                onChange={async (v) => {
                  setNotify((p) => ({ ...p, email: v }))
                  try {
                    await updateSettings({ NotifyEmail: v })
                  } catch (err) {
                    console.error(err)
                  }
                }}
              />
            </div>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'payment' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconDollar />
            </span>
            <h2 className="portal-settingsSectionText">Payment Methods</h2>
          </div>

          <div className="portal-settingsList" role="list">
            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Cash payments</div>
                <div className="portal-settingsRowSub">Accept cash payments</div>
              </div>
              <PortalSwitch
                label="Cash payments"
                checked={pay.cash}
                onChange={(v) => setPay((p) => ({ ...p, cash: v }))}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Card payments</div>
                <div className="portal-settingsRowSub">Accept card payments</div>
              </div>
              <PortalSwitch
                label="Card payments"
                checked={pay.card}
                onChange={(v) => setPay((p) => ({ ...p, card: v }))}
              />
            </div>

            <div className="portal-settingsRow" role="listitem">
              <div>
                <div className="portal-settingsRowTitle">Bank transfer</div>
                <div className="portal-settingsRowSub">Accept bank transfer payments</div>
              </div>
              <PortalSwitch
                label="Bank transfer"
                checked={pay.transfer}
                onChange={(v) => setPay((p) => ({ ...p, transfer: v }))}
              />
            </div>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Bank account number</span>
            <input className="portal-input" value={bank.accountNumber} onChange={(e) => setBank((p) => ({ ...p, accountNumber: e.target.value }))} />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Bank name</span>
            <input className="portal-input" value={bank.bankName} onChange={(e) => setBank((p) => ({ ...p, bankName: e.target.value }))} />
          </label>

          <div className="portal-formActions">
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={async () => {
                try {
                  await updateSettings({
                    PayCash: pay.cash,
                    PayCard: pay.card,
                    PayTransfer: pay.transfer,
                    BankAccountNumber: bank.accountNumber,
                    BankName: bank.bankName,
                  })
                  await loadSettings()
                } catch (err) {
                  console.error(err)
                }
              }}
            >
              Save settings
            </button>
          </div>
        </PortalCard>
      ) : null}

      {tab === 'security' ? (
        <PortalCard className="portal-settingsCard">
          <div className="portal-settingsSectionTitle">
            <span className="portal-settingsSectionIcon" aria-hidden="true">
              <IconSettings />
            </span>
            <h2 className="portal-settingsSectionText">Security</h2>
          </div>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Current password</span>
            <input
              className="portal-input"
              type="password"
              value={security.currentPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">New password</span>
            <input
              className="portal-input"
              type="password"
              value={security.newPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </label>

          <label className="portal-field portal-fieldFull">
            <span className="portal-label">Confirm new password</span>
            <input
              className="portal-input"
              type="password"
              value={security.confirmPassword}
              onChange={(e) => setSecurity((p) => ({ ...p, confirmPassword: e.target.value }))}
            />
          </label>

          <div className="portal-settingsDivider" role="separator" />

          <div className="portal-settingsRow portal-settingsRowNoBorder">
            <div>
              <div className="portal-settingsRowTitle">Two-factor authentication (2FA)</div>
              <div className="portal-settingsRowSub">Increase account security</div>
            </div>
            <PortalSwitch
              label="2FA"
              checked={twoFA}
              onChange={async (v) => {
                setTwoFA(v)
                try {
                  await updateSettings({ TwoFAEnabled: v })
                } catch (err) {
                  console.error(err)
                }
              }}
            />
          </div>

          <div className="portal-settingsActions">
            <button
              type="button"
              className="portal-outlineBtn"
              onClick={() => {
                setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' })
                setSecurityMsg('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="portal-primaryBtn portal-primaryBtnCompact"
              onClick={async () => {
                setSecurityMsg('')

                if (!security.currentPassword || !security.newPassword || !security.confirmPassword) {
                  setSecurityMsg('Please fill in all password fields.')
                  return
                }
                if (security.newPassword !== security.confirmPassword) {
                  setSecurityMsg('New password and confirmation do not match.')
                  return
                }

                try {
                  await api.put('/api/auth/me/password', {
                    currentPassword: security.currentPassword,
                    newPassword: security.newPassword,
                  })
                  setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' })
                  setSecurityMsg('Password changed successfully.')
                } catch (err) {
                  console.error(err)
                  setSecurityMsg(err?.message || 'Failed to change password.')
                }
              }}
            >
              Change password
            </button>
          </div>

          {securityMsg ? <div className="portal-profileHint" style={{ marginTop: 10 }}>{securityMsg}</div> : null}
        </PortalCard>
      ) : null}
    </div>
  )
}
// import React from 'react'

// export default function OwnerSettingsPage() {
//   return (
//     <div style={{ padding: 20 }}>
//       <h1>Owner Settings</h1>
//       <p>This is the owner settings page. Here you can update your salon information, profile, notification preferences, payment methods, and security settings.</p>
//     </div>
//   )
// }