const { asyncHandler } = require('../../utils/asyncHandler')
const reportsService = require('../../services/reports.service')

const getReports = asyncHandler(async (req, res) => {
  const data = await reportsService.getReports(req.query.from, req.query.to, {
    paymentMethod: req.query.paymentMethod,
    search: req.query.search,
    sortBy: req.query.sortBy,
  })
  res.json({ ok: true, data })
})

module.exports = { getReports }
