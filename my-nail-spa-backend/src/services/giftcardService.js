const repo = require('../repositories/giftcardRepository')
const { newId } = require('../config/query')

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function generateCode() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase()
  const extra = Math.floor(Date.now() % 10000).toString().padStart(4, '0')
  return `${rand}${extra}`.slice(0, 12)
}

function mapCard(row) {
  return {
    id: row.GiftCardId,
    code: row.Code,
    salonId: row.SalonId,
    amount: Number(row.Amount),
    balance: Number(row.Balance),
    status: row.Status,
    expiresAt: row.ExpiresAt,
    createdAt: row.CreatedAt,
    note: row.Note,
    redeemCount: Number(row.RedeemCount || 0),
  }
}

async function getPublicBySalon(salonId) {
  return (await repo.getPublicBySalon(salonId)).map((r) => ({
    giftCardId: r.GiftCardId,
    salonId: r.SalonId,
    title: r.Title,
    amount: Number(r.Amount),
    active: r.Active,
    description: r.Description,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
  }))
}

async function getCardByCode(code) {
  await repo.ensureGiftCardTables()
  return repo.findByCode(code)
}

async function applyGiftCardForAmount({ code, amount, commit = false, refType = null, refId = null, user } = {}) {
  await repo.ensureGiftCardTables()
  const cleanCode = normalizeCode(code)
  if (!cleanCode) {
    const err = new Error('Gift card code is required')
    err.status = 400
    throw err
  }
  const money = Number(amount || 0)
  const bill = Number.isFinite(money) && money > 0 ? money : 0

  const card = await repo.findByCode(cleanCode)
  if (!card) {
    const err = new Error('Gift card not found')
    err.status = 404
    throw err
  }

  const status = String(card.Status || '').toLowerCase()
  if (status !== 'active') {
    const err = new Error('Gift card is not active')
    err.status = 400
    throw err
  }
  if (card.ExpiresAt && new Date(card.ExpiresAt) <= new Date()) {
    const err = new Error('Gift card is expired')
    err.status = 400
    throw err
  }

  const balance = Number(card.Balance || 0)
  const apply = Math.min(balance, bill)
  if (!Number.isFinite(apply) || apply <= 0) {
    return { applied: 0, remainingBalance: balance, card: mapCard(card) }
  }

  if (!commit) {
    return { applied: apply, remainingBalance: balance - apply, card: mapCard(card) }
  }

  const redemptionId = newId()
  const updatedCard = await repo.updateBalanceAndSelect(cleanCode, apply)
  if (!updatedCard) {
    const err = new Error('Gift card balance is insufficient')
    err.status = 409
    throw err
  }

  await repo.insertRedemption({
    id: redemptionId,
    giftCardId: updatedCard.GiftCardId,
    code: cleanCode,
    amount: apply,
    refType: refType || null,
    refId: refId || null,
    userId: user?.id || null,
    userEmail: user?.email || null,
    note: refType ? `${refType}${refId ? `:${refId}` : ''}` : null,
  })

  return { applied: apply, remainingBalance: Number(updatedCard.Balance || 0), card: mapCard(updatedCard) }
}

async function createGiftCard(payload) {
  await repo.ensureGiftCardTables()
  const code = payload.code || generateCode()
  const exists = await repo.findByCode(code)
  if (exists) {
    const err = new Error('Gift card code already exists')
    err.status = 409
    throw err
  }
  const id = newId()
  await repo.insertGiftCard({
    id,
    code,
    salonId: payload.salonId,
    amount: payload.amount,
    expiresAt: payload.expiresAt || null,
    role: payload.role || null,
    userId: payload.userId || null,
    userEmail: payload.userEmail || null,
    note: payload.note || null,
  })
  const saved = await repo.findByCode(code)
  return mapCard(saved)
}

async function applyByTitle({ title, amount }) {
  const card = await repo.findByTitle(title)
  if (!card) return null
  let discount = Number(card.Amount) || 0
  if (discount > (Number(amount) || 0)) discount = Number(amount) || 0
  return { applied: discount, card: { id: card.GiftCardId, title: card.Title, amount: card.Amount } }
}

module.exports = { ensureGiftCardTables: repo.ensureGiftCardTables, getPublicBySalon, applyGiftCardForAmount, createGiftCard, applyByTitle, getCardByCode }
