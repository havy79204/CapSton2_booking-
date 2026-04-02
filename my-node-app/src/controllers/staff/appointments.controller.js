const { asyncHandler } = require('../../utils/asyncHandler')
const appointmentsService = require('../../services/appointments.service')

// Staff chỉ xem và quản lý appointments được assign cho họ

const getAppointments = asyncHandler(async (req, res) => {
  const userId = req.user?.userId || req.user?.sub
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }
  
  // Map userId sang staffId
  const { query } = require('../../config/query')
  const staffResult = await query(
    'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId',
    { userId }
  )
  const staffId = staffResult.recordset?.[0]?.StaffId
  
  if (!staffId) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }
  
  // Lấy appointments của staff hiện tại
  const allAppointments = await appointmentsService.listAppointments()
  const data = Array.isArray(allAppointments) 
    ? allAppointments.filter(a => String(a.staffId) === String(staffId))
    : []
  
  res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async (req, res) => {
  const { customerUserId, serviceId, serviceIds, staffId, date, time } = req.body || {}
  const hasService = (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) || serviceId

  if (!customerUserId || !hasService || !staffId || !date || !time) {
    res.status(400).json({ 
      ok: false, 
      error: 'Missing customerUserId/services/staffId/date/time' 
    })
    return
  }

  // Staff có thể tạo appointment nhưng phải assign cho chính họ hoặc staff khác
  const data = await appointmentsService.createAppointment(req.body)
  res.status(201).json({ ok: true, data })
})

const getAppointmentById = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  const userId = req.user?.userId || req.user?.sub
  
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  // Map userId sang staffId
  const { query } = require('../../config/query')
  const staffResult = await query(
    'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId',
    { userId }
  )
  const staffId = staffResult.recordset?.[0]?.StaffId
  
  if (!staffId) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }

  const data = await appointmentsService.getAppointmentById(id)
  if (!data) {
    res.status(404).json({ ok: false, error: 'Appointment not found' })
    return
  }
  
  // Staff chỉ xem appointment của chính họ
  if (String(data.staffId) !== String(staffId)) {
    res.status(403).json({ ok: false, error: 'Forbidden' })
    return
  }

  res.json({ ok: true, data })
})

const putAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  const userId = req.user?.userId || req.user?.sub
  
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400).json({ ok: false, error: 'No data to update' })
    return
  }

  // Map userId sang staffId
  const { query } = require('../../config/query')
  const staffResult = await query(
    'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId',
    { userId }
  )
  const staffId = staffResult.recordset?.[0]?.StaffId
  
  if (!staffId) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }

  // Kiểm tra appointment thuộc về staff hiện tại
  const existing = await appointmentsService.getAppointmentById(id)
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Appointment not found' })
    return
  }
  
  if (String(existing.staffId) !== String(staffId)) {
    res.status(403).json({ ok: false, error: 'Forbidden' })
    return
  }

  const data = await appointmentsService.updateAppointment(id, req.body)
  res.json({ ok: true, data })
})

const deleteAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params || {}
  const userId = req.user?.userId || req.user?.sub
  
  if (!id) {
    res.status(400).json({ ok: false, error: 'Missing id' })
    return
  }

  // Map userId sang staffId
  const { query } = require('../../config/query')
  const staffResult = await query(
    'SELECT TOP 1 StaffId FROM Staff WHERE UserId = @userId',
    { userId }
  )
  const staffId = staffResult.recordset?.[0]?.StaffId
  
  if (!staffId) {
    res.status(404).json({ ok: false, error: 'Staff not found' })
    return
  }

  // Kiểm tra appointment thuộc về staff hiện tại
  const existing = await appointmentsService.getAppointmentById(id)
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Appointment not found' })
    return
  }
  
  if (String(existing.staffId) !== String(staffId)) {
    res.status(403).json({ ok: false, error: 'Forbidden' })
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
