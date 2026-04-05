const { asyncHandler } = require('../../utils/asyncHandler')
const settingsService = require('../../services/settings.service')
const appointmentsService = require('../../services/appointments.service')

function getUserIdFromReq(req) {
  const userId = String(req.userId || req.user?.sub || '').trim()
  return userId || null
}

const getSettings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const data = await settingsService.getSettingsMap({ userId })
  res.json({ ok: true, data })
})

const putSettings = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  const updates = req.body?.updates
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ ok: false, error: 'Missing updates object' })
    return
  }

  // Check if commission tiers were updated
  const hasCommissionChanges = updates.CommissionTiers !== undefined ||
    updates.CommissionTierLow !== undefined ||
    updates.CommissionRateLow !== undefined ||
    updates.CommissionTierHigh !== undefined ||
    updates.CommissionRateHigh !== undefined

  await settingsService.updateSettingsMap(updates, { userId })
  
  // If commission tiers changed, recalculate for all staff
  if (hasCommissionChanges) {
    try {
      console.log('[SETTINGS] Commission tiers changed, triggering recalculation...')
      await appointmentsService.recalculateAllCommissions()
    } catch (err) {
      console.error('[SETTINGS] Error during commission recalculation:', err.message)
      // Don't fail the request, just log the error
    }
  }
  
  res.json({ ok: true })
})

const recalculateCommissions = asyncHandler(async (req, res) => {
  const result = await appointmentsService.recalculateAllCommissions()
  res.json(result)
})

module.exports = {
  getSettings,
  putSettings,
  recalculateCommissions,
}