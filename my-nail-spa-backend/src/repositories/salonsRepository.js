const { query, newId } = require('../config/query')

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
    if (!Number.isNaN(d.getTime())) {
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
    }
  }

  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`

  return ''
}

async function findAllSalons() {
  return query('SELECT * FROM dbo.Salons ORDER BY CreatedAt DESC')
}

async function findReviewCounts() {
  return query('SELECT SalonId, COUNT(*) AS Cnt FROM dbo.SalonReviews GROUP BY SalonId')
}

async function findSalonServiceIds(salonId, includeDraft = false) {
  const statusFilter = includeDraft ? "(N'published', N'draft', N'active')" : "(N'published', N'active')"
  return query(
    `SELECT ServiceTypeId FROM dbo.SalonServices WHERE SalonId=@salonId AND Status IN ${statusFilter}`,
    { salonId },
  )
}

async function findSalonTechnicians(salonId) {
  return query(
    "SELECT UserId, Name FROM dbo.Users WHERE SalonId=@id AND RoleKey=N'staff' AND (Status IS NULL OR Status <> N'disabled')",
    { id: salonId },
  )
}

async function findProfiles() {
  return query('SELECT * FROM dbo.SalonProfiles ORDER BY UpdatedAt DESC')
}

async function findServiceTypes() {
  return query('SELECT * FROM dbo.ServiceTypes ORDER BY Name')
}

async function findSalonById(id) {
  return query('SELECT TOP 1 * FROM dbo.Salons WHERE SalonId=@id', { id })
}

async function findSalonServices(salonId, includeDraft = false) {
  const statusFilter = includeDraft ? "(N'published', N'draft', N'active')" : "(N'published', N'active')"
  return query(
    `SELECT ss.SalonId, ss.ServiceTypeId, ss.Name, ss.DurationMin, ss.Price, ss.Status
       FROM dbo.SalonServices ss
       WHERE ss.SalonId=@salonId AND ss.Status IN ${statusFilter}
       ORDER BY ss.ServiceTypeId`,
    { salonId },
  )
}

async function findServiceRecipe(serviceTypeId) {
  return query('SELECT ServiceTypeId, SKU, Qty, Uom FROM dbo.ServiceRecipeLines WHERE ServiceTypeId=@serviceTypeId ORDER BY SKU', {
    serviceTypeId,
  })
}

async function deleteServiceRecipe(serviceTypeId) {
  return query('DELETE FROM dbo.ServiceRecipeLines WHERE ServiceTypeId=@serviceTypeId', { serviceTypeId })
}

async function insertServiceRecipeLine(serviceTypeId, sku, qty, uom) {
  return query('INSERT INTO dbo.ServiceRecipeLines(ServiceTypeId, SKU, Qty, Uom) VALUES (@serviceTypeId, @sku, @qty, @uom)', {
    serviceTypeId,
    sku,
    qty,
    uom,
  })
}

async function findSalonProfileWithDetail(salonId) {
  const profile = await query('SELECT TOP 1 * FROM dbo.SalonProfiles WHERE SalonId=@salonId', { salonId })
  const hours = await query('SELECT * FROM dbo.SalonProfileHours WHERE SalonId=@salonId ORDER BY DayOfWeek', { salonId })
  const giftCards = await query('SELECT * FROM dbo.SalonGiftCards WHERE SalonId=@salonId ORDER BY CreatedAt DESC', { salonId })
  const photos = await query('SELECT * FROM dbo.SalonPhotos WHERE SalonId=@salonId ORDER BY SortOrder, CreatedAt DESC', { salonId })
  return { profile: profile.recordset[0], hours: hours.recordset, giftCards: giftCards.recordset, photos: photos.recordset }
}

async function upsertSalonProfile(salonId, body) {
  const avatarImageUrl = body.avatarImageUrl ?? body.avatarImage ?? null
  const coverImageUrl = body.coverImageUrl ?? body.coverImage ?? null

  await query(
    `MERGE dbo.SalonProfiles AS t
       USING (SELECT @salonId AS SalonId) AS s
       ON t.SalonId = s.SalonId
       WHEN MATCHED THEN
         UPDATE SET Name=@name, Address=@address, Phone=@phone, Email=@email, Policy=@policy, AvatarImageUrl=@avatarImageUrl, CoverImageUrl=@coverImageUrl, Description=@description, UpdatedAt=SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT(SalonId, Name, Address, Phone, Email, Policy, AvatarImageUrl, CoverImageUrl, Description, CreatedAt, UpdatedAt)
         VALUES(@salonId, @name, @address, @phone, @email, @policy, @avatarImageUrl, @coverImageUrl, @description, SYSUTCDATETIME(), SYSUTCDATETIME());`,
    {
      salonId,
      name: body.name ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      policy: body.policy ?? null,
      avatarImageUrl,
      coverImageUrl,
      description: body.description ?? null,
    },
  )

  if (body.hours) {
    await query('DELETE FROM dbo.SalonProfileHours WHERE SalonId=@salonId', { salonId })
    const dayOfWeek = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
    for (const [key, val] of Object.entries(body.hours || {})) {
      const d = dayOfWeek[key]
      if (!d) continue
      const openTime = val?.open ? formatTimeHHMM(val.open) : null
      const closeTime = val?.close ? formatTimeHHMM(val.close) : null
      const closed = Boolean(val?.closed)
      await query(
        `INSERT INTO dbo.SalonProfileHours(SalonId, DayOfWeek, OpenTime, CloseTime, Closed)
         VALUES(@salonId, @dayOfWeek, @openTime, @closeTime, @closed)`,
        { salonId, dayOfWeek: d, openTime, closeTime, closed },
      )
    }
  }

  if (body.giftCards) {
    await query('DELETE FROM dbo.SalonGiftCards WHERE SalonId=@salonId', { salonId })
    for (const raw of body.giftCards || []) {
      const giftCardId = String(raw?.id || '').trim() || newId()
      await query(
        `INSERT INTO dbo.SalonGiftCards(GiftCardId, SalonId, Title, Amount, Active, Description, CreatedAt, UpdatedAt)
         VALUES(@id, @salonId, @title, @amount, @active, @description, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: giftCardId,
          salonId,
          title: String(raw?.title || '').trim() || 'Gift card',
          amount: Number(raw?.amount || 0),
          active: raw?.active === false ? 0 : 1,
          description: raw?.description ? String(raw.description) : null,
        },
      )
    }
  }

  if (body.photos) {
    await query('DELETE FROM dbo.SalonPhotos WHERE SalonId=@salonId', { salonId })
    for (const raw of body.photos || []) {
      const photoId = String(raw?.id || '').trim() || newId()
      await query(
        `INSERT INTO dbo.SalonPhotos(PhotoId, SalonId, Url, Src, Caption, SortOrder, Active, CreatedAt, UpdatedAt)
         VALUES(@id, @salonId, @url, @src, @caption, @sortOrder, @active, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: photoId,
          salonId,
          url: raw?.url ? String(raw.url) : null,
          src: raw?.src ? String(raw.src) : null,
          caption: raw?.caption ? String(raw.caption) : null,
          sortOrder: Number(raw?.sortOrder || 0),
          active: raw?.active === false ? 0 : 1,
        },
      )
    }
  }
}

async function updateProfileCoordinates(salonId, latitude, longitude) {
  return query(
    `UPDATE dbo.SalonProfiles
       SET Latitude = @latitude, Longitude = @longitude, UpdatedAt = SYSUTCDATETIME()
       WHERE SalonId = @salonId`,
    { salonId, latitude, longitude },
  )
}

async function insertSalon(data) {
  const id = String(data.id || '').trim() || newId()
  await query(
    `INSERT INTO dbo.Salons(SalonId, Name, Tagline, Address, LogoUrl, Rating, ReviewCount, HeroHint, Status, CreatedAt, UpdatedAt)
     VALUES(@id, @name, @tagline, @address, @logo, NULL, NULL, @heroHint, @status, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    {
      id,
      name: data.name,
      tagline: data.tagline || null,
      address: data.address || null,
      logo: data.logo || null,
      heroHint: data.heroHint || null,
      status: data.status || 'active',
    },
  )
  return findSalonById(id)
}

async function updateSalon(id, body) {
  const existing = await query('SELECT TOP 1 * FROM dbo.Salons WHERE SalonId=@id', { id })
  const row = existing.recordset[0]
  if (!row) return null

  await query(
    `UPDATE dbo.Salons
       SET Name=@name,
           Tagline=@tagline,
           Address=@address,
           LogoUrl=@logo,
           HeroHint=@heroHint,
           Status=@status,
           UpdatedAt=SYSUTCDATETIME()
       WHERE SalonId=@id`,
    {
      id,
      name: body.name ?? row.Name,
      tagline: body.tagline !== undefined ? (body.tagline || null) : row.Tagline,
      address: body.address !== undefined ? (body.address || null) : row.Address,
      logo: body.logo !== undefined ? (body.logo || null) : row.LogoUrl,
      heroHint: body.heroHint !== undefined ? (body.heroHint || null) : row.HeroHint,
      status: body.status ?? row.Status,
    },
  )

  return findSalonById(id)
}

async function deleteSalon(id) {
  return query('DELETE FROM dbo.Salons WHERE SalonId=@id', { id })
}

async function upsertServiceType(serviceTypeId, name, durationMin, price) {
  return query(
    `MERGE dbo.ServiceTypes AS t
       USING (SELECT @id AS ServiceTypeId) AS s
       ON t.ServiceTypeId = s.ServiceTypeId
       WHEN MATCHED THEN
         UPDATE SET Name=@name, DefaultDurationMin=@durationMin, DefaultPrice=@price
       WHEN NOT MATCHED THEN
         INSERT(ServiceTypeId, Name, DefaultDurationMin, DefaultPrice)
         VALUES(@id, @name, @durationMin, @price);`,
    { id: serviceTypeId, name, durationMin, price },
  )
}

async function findSalonServiceExists(salonId, serviceTypeId) {
  const exists = await query('SELECT TOP 1 ServiceTypeId FROM dbo.SalonServices WHERE SalonId=@salonId AND ServiceTypeId=@serviceTypeId', {
    salonId,
    serviceTypeId,
  })
  return Boolean(exists.recordset[0])
}

async function upsertSalonService(salonId, serviceTypeId, name, durationMin, price, status) {
  const exists = await query('SELECT TOP 1 * FROM dbo.SalonServices WHERE SalonId=@salonId AND ServiceTypeId=@serviceTypeId', {
    salonId,
    serviceTypeId,
  })

  if (exists.recordset.length) {
    return query(
      `UPDATE dbo.SalonServices
       SET Name=@name, DurationMin=@durationMin, Price=@price, Status=@status, UpdatedAt=SYSUTCDATETIME()
       WHERE SalonId=@salonId AND ServiceTypeId=@serviceTypeId`,
      { salonId, serviceTypeId, name, durationMin, price, status },
    )
  }

  return query(
    `INSERT INTO dbo.SalonServices(SalonId, ServiceTypeId, Name, DurationMin, Price, Status, CreatedAt, UpdatedAt)
     VALUES(@salonId, @serviceTypeId, @name, @durationMin, @price, @status, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    { salonId, serviceTypeId, name, durationMin, price, status },
  )
}

async function deleteSalonService(salonId, serviceTypeId) {
  return query('DELETE FROM dbo.SalonServices WHERE SalonId=@salonId AND ServiceTypeId=@serviceTypeId', { salonId, serviceTypeId })
}

module.exports = {
  findAllSalons,
  findReviewCounts,
  findSalonServiceIds,
  findSalonTechnicians,
  findProfiles,
  findServiceTypes,
  findSalonById,
  findSalonServices,
  findServiceRecipe,
  deleteServiceRecipe,
  insertServiceRecipeLine,
  findSalonProfileWithDetail,
  upsertSalonProfile,
  updateProfileCoordinates,
  insertSalon,
  updateSalon,
  deleteSalon,
  upsertServiceType,
  findSalonServiceExists,
  upsertSalonService,
  deleteSalonService,
}
