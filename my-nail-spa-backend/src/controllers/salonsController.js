const { z } = require('zod')
const salonsRepo = require('../repositories/salonsRepository')
const salonsService = require('../services/salonsService')
const { newId } = require('../config/query')

async function listSalons(req, res, next) {
  try {
    const result = await salonsRepo.findAllSalons()
    const reviewCountsRes = await salonsRepo.findReviewCounts()
    const reviewCountMap = new Map()
    for (const row of reviewCountsRes.recordset) reviewCountMap.set(row.SalonId, Number(row.Cnt) || 0)

    const items = []
    for (const row of result.recordset) {
      const id = row.SalonId
      const services = await salonsRepo.findSalonServiceIds(id)
      const techs = await salonsRepo.findSalonTechnicians(id)
      items.push({
        ...salonsService.mapSalonRow(row, reviewCountMap.get(id) || 0),
        serviceIds: services.recordset.map((s) => s.ServiceTypeId),
        technicians: techs.recordset.map((t) => ({ id: t.UserId, name: t.Name })),
      })
    }

    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function geocodeProfile(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const key = process.env.GOOGLE_GEOCODING_API_KEY
    if (!key) return res.status(500).json({ error: 'Geocoding not configured' })

    const { profile } = await salonsRepo.findSalonProfileWithDetail(salonId)
    if (!profile) return res.status(404).json({ error: 'Profile not found' })
    const address = String(profile.Address || '').trim()
    if (!address) return res.status(400).json({ error: 'No address to geocode' })

    // Use fetch (Node 18+) or global.fetch
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`
    const resp = await fetch(url)
    if (!resp.ok) return res.status(502).json({ error: 'Geocoding service error' })
    const data = await resp.json()
    const first = (data.results || [])[0]
    if (!first || !first.geometry || !first.geometry.location) return res.status(422).json({ error: 'No location found for address' })
    const { lat, lng } = first.geometry.location

    await salonsRepo.updateProfileCoordinates(salonId, Number(lat), Number(lng))

    const updated = await salonsRepo.findSalonProfileWithDetail(salonId)
    return res.json({ item: updated.profile ? {
      salonId: updated.profile.SalonId,
      name: updated.profile.Name,
      address: updated.profile.Address,
      latitude: updated.profile.Latitude ?? Number(lat),
      longitude: updated.profile.Longitude ?? Number(lng),
      avatarImageUrl: updated.profile.AvatarImageUrl,
      coverImageUrl: updated.profile.CoverImageUrl,
      description: updated.profile.Description,
      createdAt: updated.profile.CreatedAt,
      updatedAt: updated.profile.UpdatedAt,
    } : null })
  } catch (err) {
    next(err)
  }
}

async function listProfiles(req, res, next) {
  try {
    const result = await salonsRepo.findProfiles()
    res.json({
      items: result.recordset.map((r) => ({
        salonId: r.SalonId,
        name: r.Name,
        address: r.Address,
        phone: r.Phone,
        email: r.Email,
        policy: r.Policy,
        avatarImageUrl: r.AvatarImageUrl,
        coverImageUrl: r.CoverImageUrl,
        description: r.Description,
        latitude: r.Latitude ?? null,
        longitude: r.Longitude ?? null,
        createdAt: r.CreatedAt,
        updatedAt: r.UpdatedAt,
      })),
    })
  } catch (err) {
    next(err)
  }
}

async function listServiceTypes(req, res, next) {
  try {
    const result = await salonsRepo.findServiceTypes()
    res.json({
      items: result.recordset.map((r) => ({ id: r.ServiceTypeId, name: r.Name, durationMin: r.DefaultDurationMin, price: r.DefaultPrice === null || r.DefaultPrice === undefined ? null : Number(r.DefaultPrice) })),
    })
  } catch (err) {
    next(err)
  }
}

async function getSalon(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const result = await salonsRepo.findSalonById(id)
    const row = result.recordset[0]
    if (!row) return res.status(404).json({ error: 'Salon not found' })

    const techs = await salonsRepo.findSalonTechnicians(id)
    const services = await salonsRepo.findSalonServiceIds(id)

    res.json({
      item: {
        ...salonsService.mapSalonRow(row),
        technicians: techs.recordset.map((t) => ({ id: t.UserId, name: t.Name })),
        serviceIds: services.recordset.map((s) => s.ServiceTypeId),
      },
    })
  } catch (err) {
    next(err)
  }
}

async function listSalonServices(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const wantsDraft = String(req.query.includeDraft || '').toLowerCase() === 'true'
    const includeDraft = wantsDraft && (req.user?.role === 'admin' || req.user?.role === 'owner')
    const result = await salonsRepo.findSalonServices(salonId, includeDraft)
    res.json({ items: result.recordset.map((r) => ({ id: r.ServiceTypeId, salonId: r.SalonId, name: r.Name, durationMin: r.DurationMin, price: Number(r.Price), status: r.Status })) })
  } catch (err) {
    next(err)
  }
}

async function getServiceRecipe(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const serviceTypeId = String(req.params.serviceTypeId || '').trim()
    await salonsService.assertCanManageSalonService(req, salonId, serviceTypeId)
    const result = await salonsRepo.findServiceRecipe(serviceTypeId)
    res.json({ items: result.recordset.map((r) => ({ serviceTypeId: r.ServiceTypeId, sku: r.SKU, qty: Number(r.Qty), uom: r.Uom })) })
  } catch (err) {
    next(err)
  }
}

async function putServiceRecipe(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const serviceTypeId = String(req.params.serviceTypeId || '').trim()
    await salonsService.assertCanManageSalonService(req, salonId, serviceTypeId)

    const body = z.object({ lines: z.array(z.object({ sku: z.string().min(1), qty: z.coerce.number().positive(), uom: z.string().min(1).max(32) })).default([]) }).parse(req.body)

    const lines = body.lines.map((l) => ({ sku: salonsService.normSku(l.sku), qty: Number(l.qty), uom: String(l.uom || '').trim() })).filter((l) => l.sku && l.qty > 0 && l.uom)

    await salonsRepo.deleteServiceRecipe(serviceTypeId)
    for (const line of lines) await salonsRepo.insertServiceRecipeLine(serviceTypeId, line.sku, line.qty, line.uom)

    const updated = await salonsRepo.findServiceRecipe(serviceTypeId)
    res.json({ items: updated.recordset.map((r) => ({ serviceTypeId: r.ServiceTypeId, sku: r.SKU, qty: Number(r.Qty), uom: r.Uom })) })
  } catch (err) {
    next(err)
  }
}

async function getProfile(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const { profile, hours, giftCards, photos } = await salonsRepo.findSalonProfileWithDetail(salonId)
    if (!profile) return res.json({ item: null })

    const hourMap = { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null }
    const dayKey = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
    for (const h of hours) {
      const key = dayKey[h.DayOfWeek]
      if (!key) continue
      const open = salonsRepo.formatTimeHHMM ? salonsRepo.formatTimeHHMM(h.OpenTime) : salonsService.formatTimeHHMM(h.OpenTime)
      const close = salonsRepo.formatTimeHHMM ? salonsRepo.formatTimeHHMM(h.CloseTime) : salonsService.formatTimeHHMM(h.CloseTime)
      hourMap[key] = { open, close, closed: Boolean(h.Closed) }
    }
    for (const k of Object.keys(hourMap)) if (!hourMap[k]) hourMap[k] = { open: '10:00', close: '19:00', closed: k === 'Sun' }

    res.json({
      item: {
        salonId: profile.SalonId,
        name: profile.Name,
        address: profile.Address,
        latitude: profile.Latitude ?? null,
        longitude: profile.Longitude ?? null,
        phone: profile.Phone,
        email: profile.Email,
        policy: profile.Policy,
        avatarImageUrl: profile.AvatarImageUrl,
        coverImageUrl: profile.CoverImageUrl,
        description: profile.Description,
        hours: hourMap,
        giftCards: giftCards.map((g) => ({ id: g.GiftCardId, title: g.Title, amount: Number(g.Amount), active: Boolean(g.Active), description: g.Description })),
        photos: photos.map((p) => ({ id: p.PhotoId, url: p.Url, src: p.Src, caption: p.Caption, sortOrder: p.SortOrder, active: Boolean(p.Active) })),
        createdAt: profile.CreatedAt,
        updatedAt: profile.UpdatedAt,
      },
    })
  } catch (err) {
    next(err)
  }
}

async function createSalon(req, res, next) {
  try {
    const body = z.object({ id: z.string().optional(), name: z.string().min(1), tagline: z.string().optional(), address: z.string().optional(), logo: z.string().optional(), heroHint: z.string().optional(), status: z.string().optional() }).parse(req.body)
    const result = await salonsRepo.insertSalon(body)
    res.status(201).json({ item: salonsService.mapSalonRow(result.recordset[0]) })
  } catch (err) {
    next(err)
  }
}

async function patchSalon(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    const body = z.object({ name: z.string().min(1).optional(), tagline: z.string().optional(), address: z.string().optional(), logo: z.string().optional(), heroHint: z.string().optional(), status: z.string().optional() }).parse(req.body)
    const updated = await salonsRepo.updateSalon(id, body)
    if (!updated.recordset || !updated.recordset[0]) return res.status(404).json({ error: 'Salon not found' })
    res.json({ item: salonsService.mapSalonRow(updated.recordset[0]) })
  } catch (err) {
    next(err)
  }
}

async function deleteSalonHandler(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    await salonsRepo.deleteSalon(id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

async function putProfile(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    if (req.user.role === 'owner') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== salonId) return res.status(403).json({ error: 'Forbidden' })
    }

    const body = z.object({ name: z.string().optional(), address: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), policy: z.string().optional(), avatarImageUrl: z.string().optional(), coverImageUrl: z.string().optional(), avatarImage: z.string().optional(), coverImage: z.string().optional(), description: z.string().optional(), hours: z.record(z.any()).optional(), giftCards: z.array(z.any()).optional(), photos: z.array(z.any()).optional() }).parse(req.body)

    await salonsRepo.upsertSalonProfile(salonId, { ...body, formatTimeHHMM: salonsService.formatTimeHHMM })

    const result = await salonsRepo.findSalonProfileWithDetail(salonId)
    const row = result.profile
    res.json({
      item: row
        ? {
            salonId: row.SalonId,
            name: row.Name,
            address: row.Address,
            phone: row.Phone,
            email: row.Email,
            policy: row.Policy,
            avatarImageUrl: row.AvatarImageUrl,
            coverImageUrl: row.CoverImageUrl,
            description: row.Description,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
          }
        : null,
    })
  } catch (err) {
    next(err)
  }
}

async function postService(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    if (req.user.role === 'owner') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== salonId) return res.status(403).json({ error: 'Forbidden' })
    }

    const body = z.object({ id: z.string().optional(), name: z.string().min(1), durationMin: z.number().int().min(1).max(600), price: z.number().nonnegative(), status: z.string().optional() }).parse(req.body)

    const serviceTypeId = String(body.id || '').trim() || newId()
    await salonsRepo.upsertServiceType(serviceTypeId, body.name.trim(), body.durationMin, body.price)

    const exists = await salonsRepo.findSalonServiceExists(salonId, serviceTypeId)
    await salonsRepo.upsertSalonService(salonId, serviceTypeId, body.name.trim(), body.durationMin, body.price, body.status || 'draft')

    const row = await salonsRepo.findSalonServices(salonId, true)
    const r = row.recordset.find((x) => x.ServiceTypeId === serviceTypeId)
    res.json({ item: r ? { id: r.ServiceTypeId, salonId: r.SalonId, name: r.Name, durationMin: r.DurationMin, price: Number(r.Price), status: r.Status } : null })
  } catch (err) {
    next(err)
  }
}

async function deleteService(req, res, next) {
  try {
    const salonId = String(req.params.id || '').trim()
    const serviceTypeId = String(req.params.serviceTypeId || '').trim()
    if (req.user.role === 'owner') {
      const mySalonId = String(req.user?.salonId || '').trim()
      if (!mySalonId || mySalonId !== salonId) return res.status(403).json({ error: 'Forbidden' })
    }

    await salonsRepo.deleteSalonService(salonId, serviceTypeId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listSalons,
  listProfiles,
  listServiceTypes,
  getSalon,
  listSalonServices,
  getServiceRecipe,
  putServiceRecipe,
  getProfile,
  createSalon,
  patchSalon,
  deleteSalonHandler,
  putProfile,
  postService,
  geocodeProfile,
  deleteService,
}
