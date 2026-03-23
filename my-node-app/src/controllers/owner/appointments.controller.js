const { asyncHandler } = require('../../utils/asyncHandler')
const appointmentsService = require('../../services/appointments.service')

const getAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.listAppointments()
  res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async (req, res) => {
  const { customerUserId, serviceId, staffId, date, time } = req.body || {}
  if (!customerUserId || !serviceId || !staffId || !date || !time) {
    res.status(400).json({ ok: false, error: 'Missing customerUserId/serviceId/staffId/date/time' })
    return
  }

  const data = await appointmentsService.createAppointment(req.body)
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

  const { customerUserId, serviceId, staffId, date, time } = req.body || {}
  if (!customerUserId || !serviceId || !staffId || !date || !time) {
    res.status(400).json({ ok: false, error: 'Missing customerUserId/serviceId/staffId/date/time' })
    return
  }

  const data = await appointmentsService.updateAppointment(id, req.body)
  res.json({ ok: true, data })
})

const deleteAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  const data = await appointmentsService.cancelAppointment(id)
  res.json({ ok: true, data })
})

module.exports = {
  getAppointments,
  getAppointmentById,
  postAppointment,
  putAppointment,
  deleteAppointment,
}
