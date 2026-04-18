const { asyncHandler } = require('../../utils/asyncHandler')

const appointmentsService = require('../../services/appointments.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')



const getAppointments = asyncHandler(async (req, res) => {

  try {

    const data = await appointmentsService.listAppointments()

    res.json({ ok: true, data })

  } catch (error) {

    console.error('[DEBUG CONTROLLER] Error in getAppointments:', error)

    res.status(500).json({ ok: false, error: error.message })

  }

})



const postAppointment = asyncHandler(async (req, res) => {

  try {

    const { customerUserId, serviceId, serviceIds, staffId, date, time } = req.body || {}

    const hasService = (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) || serviceId;

    if (!customerUserId || !hasService || !staffId || !date || !time) {

      res.status(400).json({ 

        ok: false, 

        error: 'Missing customerUserId/services/staffId/date/time' 

      })

      return

    }

    const data = await appointmentsService.createAppointment(req.body)

    res.status(201).json({ ok: true, data })

  } catch (error) {

    // Trả về status code từ error nếu có (ví dụ 400 cho conflict), nếu không thì 500
    const statusCode = error.status || 500
    res.status(statusCode).json({ ok: false, error: error.message })

  }

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


  try {

    const data = await appointmentsService.updateAppointment(id, req.body)

    res.json({ ok: true, data })

  } catch (error) {

    console.error('[DEBUG CONTROLLER] Error in putAppointment:', error)

    // Trả về status code từ error nếu có (ví dụ 400 cho conflict), nếu không thì 500
    const statusCode = error.status || 500
    res.status(statusCode).json({ ok: false, error: error.message })

  }

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