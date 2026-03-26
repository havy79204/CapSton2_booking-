// const { asyncHandler } = require('../../utils/asyncHandler')
// const appointmentsService = require('../../services/appointments.service')

// const getAppointments = asyncHandler(async (req, res) => {
//   const data = await appointmentsService.listAppointments()
//   res.json({ ok: true, data })
// })

// const postAppointment = asyncHandler(async (req, res) => {
//   const { customerUserId, serviceId, staffId, date, time } = req.body || {}
//   if (!customerUserId || !serviceId || !staffId || !date || !time) {
//     res.status(400).json({ ok: false, error: 'Missing customerUserId/serviceId/staffId/date/time' })
//     return
//   }

//   const data = await appointmentsService.createAppointment(req.body)
//   res.status(201).json({ ok: true, data })
// })

// const getAppointmentById = asyncHandler(async (req, res) => {
//   const { id } = req.params || {}
//   if (!id) {
//     res.status(400).json({ ok: false, error: 'Missing id' })
//     return
//   }

//   const data = await appointmentsService.getAppointmentById(id)
//   if (!data) {
//     res.status(404).json({ ok: false, error: 'Appointment not found' })
//     return
//   }

//   res.json({ ok: true, data })
// })

// // const putAppointment = asyncHandler(async (req, res) => {
// //   const { id } = req.params || {}
// //   if (!id) {
// //     res.status(400).json({ ok: false, error: 'Missing id' })
// //     return
// //   }

// //   const { customerUserId, serviceId, staffId, date, time } = req.body || {}
// //   if (!customerUserId || !serviceId || !staffId || !date || !time) {
// //     res.status(400).json({ ok: false, error: 'Missing customerUserId/serviceId/staffId/date/time' })
// //     return
// //   }

// //   const data = await appointmentsService.updateAppointment(id, req.body)
// //   res.json({ ok: true, data })
// // })

// const putAppointment = asyncHandler(async (req, res) => {
//   const { id } = req.params || {}
//   if (!id) {
//     res.status(400).json({ ok: false, error: 'Missing id' })
//     return
//   }

//   // ❌ bỏ validate cứng
//   // chỉ cần có ít nhất 1 field
//   if (!req.body || Object.keys(req.body).length === 0) {
//     res.status(400).json({ ok: false, error: 'No data to update' })
//     return
//   }

//   const data = await appointmentsService.updateAppointment(id, req.body)
//   res.json({ ok: true, data })
// })

// const deleteAppointment = asyncHandler(async (req, res) => {
//   const { id } = req.params || {}
//   if (!id) {
//     res.status(400).json({ ok: false, error: 'Missing id' })
//     return
//   }

//   const data = await appointmentsService.cancelAppointment(id)
//   res.json({ ok: true, data })
// })

// module.exports = {
//   getAppointments,
//   getAppointmentById,
//   postAppointment,
//   putAppointment,
//   deleteAppointment,
// }
































const { asyncHandler } = require('../../utils/asyncHandler')
const appointmentsService = require('../../services/appointments.service')

const getAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.listAppointments()
  res.json({ ok: true, data })
})

const postAppointment = asyncHandler(async (req, res) => {
  // ✅ SỬA TẠI ĐÂY: Chấp nhận cả serviceId (cũ) hoặc serviceIds (mới)
  const { customerUserId, serviceId, serviceIds, staffId, date, time } = req.body || {}
  
  // Kiểm tra nếu không có mảng serviceIds và cũng không có serviceId đơn lẻ
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