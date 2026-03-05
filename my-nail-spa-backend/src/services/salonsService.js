const salonsRepo = require('../repositories/salonsRepository')

function normSku(input) {
  const raw = String(input || '').trim().toUpperCase()
  if (!raw) return ''
  const cleaned = raw.replace(/\s+/g, '-').replace(/[^A-Z0-9._-]/g, '').replace(/-+/g, '-').slice(0, 64)
  return cleaned
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatTimeHHMM(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const hh = value.getUTCHours()
    const mm = value.getUTCMinutes()
    return `${pad2(hh)}:${pad2(mm)}`
  }
  const s = String(value).trim()
  if (!s) return ''
  if (s.includes('T') && s.includes(':')) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  }
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`
  return ''
}

async function assertCanManageSalonService(req, salonId, serviceTypeId) {
  const role = req.user?.role
  const userSalonId = req.user?.salonId

  if (role === 'owner' && String(userSalonId || '') !== String(salonId || '')) {
    const err = new Error('Forbidden')
    err.status = 403
    throw err
  }

  const exists = await salonsRepo.findSalonServiceExists(salonId, serviceTypeId)
  if (!exists) {
    const err = new Error('Service not found in this salon')
    err.status = 404
    throw err
  }
}

function mapSalonRow(r, reviewCount = 0) {
  return {
    id: r.SalonId,
    name: r.Name,
    tagline: r.Tagline,
    address: r.Address,
    logo: r.LogoUrl,
    rating: r.Rating,
    reviews: reviewCount,
    heroHint: r.HeroHint,
    status: r.Status,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
  }
}

module.exports = {
  normSku,
  formatTimeHHMM,
  assertCanManageSalonService,
  mapSalonRow,
}
