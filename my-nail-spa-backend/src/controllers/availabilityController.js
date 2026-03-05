const { z } = require('zod')
const availabilityService = require('../services/availabilityService')

async function getTimeSlotAvailability(req, res, next) {
  try {
    const schema = z.object({
      salonId: z.string().min(1),
      dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
      technicianId: z.string().optional(),
      serviceIds: z.string().optional() // comma-separated
    })

    const { salonId, dateISO, technicianId, serviceIds: serviceIdsStr } = schema.parse(req.query)

    const serviceIds = serviceIdsStr 
      ? String(serviceIdsStr).split(',').map(s => s.trim()).filter(Boolean)
      : []

    const result = await availabilityService.getTimeSlotAvailability({
      salonId,
      dateISO,
      technicianId: technicianId || 'auto',
      serviceIds
    })

    res.json(result)
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid parameters', details: err.errors })
    }
    next(err)
  }
}

module.exports = {
  getTimeSlotAvailability
}
