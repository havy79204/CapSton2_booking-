const { asyncHandler } = require('../../utils/asyncHandler')
const dashboardService = require('../../services/dashboard.service')

const getDashboard = asyncHandler(async (req, res) => {
  const period = String(req.query?.period || 'day').toLowerCase()
  const refs = {
    refDate: req.query?.refDate,
    refMonth: req.query?.refMonth,
    refYear: req.query?.refYear,
  }
  const data = await dashboardService.getDashboard(period, refs)
  res.json({ ok: true, data })
})

module.exports = { getDashboard }
