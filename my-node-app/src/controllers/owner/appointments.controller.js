const { asyncHandler } = require('../../utils/asyncHandler')
const appointmentsService = require('../../services/appointments.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')

const getAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.listAppointments()
  res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async (req, res) => {
  const { customerUserId, serviceId, serviceIds, staffId, date, time } = req.body || {}
  const hasService = (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) || serviceId;

  if (!customerUserId || !hasService || !staffId || !date || !time) {
    res.status(400).json({ 
      ok: false, 
      error: 'Missing customerUserId/services/staffId/date/time' 
    })
    return
  }

  // Truyền nguyên req.body qua Service, Service sẽ lo việc lặp mảng để chèn DB
  const data = await appointmentsService.createAppointment(req.body)
  emitStaffDataUpdated({ source: 'appointments', action: 'create', staffId: String(req.body?.staffId || '') })
  res.status(201).json({ ok: true, data })
})

const getAppointmentById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await appointmentsService.getAppointmentById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Appointment not found' })
    return
  }

  res.json({ ok: true, data })
})

const putAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400).json({ ok: false, error: 'No data to update' })
    return
  }

  const data = await appointmentsService.updateAppointment(id, req.body)
  emitStaffDataUpdated({ source: 'appointments', action: 'update', staffId: String(req.body?.staffId || ''), appointmentId: String(id) })
  res.json({ ok: true, data })
})

const deleteAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await appointmentsService.cancelAppointment(id)
  emitStaffDataUpdated({ source: 'appointments', action: 'delete', appointmentId: String(id) })
  res.json({ ok: true, data })
})

module.exports = {
  getAppointments,
  getAppointmentById,
  postAppointment,
  putAppointment,
  deleteAppointment,
}