const { asyncHandler } = require('../../utils/asyncHandler')
const settingsService = require('../../services/settings.service')

const getSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getSettingsMap()
  res.json({ ok: true, data })
})

const putSettings = asyncHandler(async (req, res) => {
  const updates = req.body?.updates
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ ok: false, error: 'Missing updates object' })
    return
  }

  await settingsService.updateSettingsMap(updates)
  res.json({ ok: true })
})

module.exports = {
  getSettings,
  putSettings,
}
