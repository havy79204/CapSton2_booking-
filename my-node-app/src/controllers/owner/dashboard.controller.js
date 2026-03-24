const { asyncHandler } = require('../../utils/asyncHandler')
const dashboardService = require('../../services/dashboard.service')

const getDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard()
  res.json({ ok: true, data })
})

module.exports = { getDashboard }
