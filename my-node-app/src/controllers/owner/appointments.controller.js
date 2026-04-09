const { asyncHandler } = require('../../utils/asyncHandler')

const appointmentsService = require('../../services/appointments.service')
const { emitStaffDataUpdated } = require('../../realtime/socket')



const getAppointments = asyncHandler(async (req, res) => {

  console.log('[DEBUG CONTROLLER] getAppointments called')

  try {

    const data = await appointmentsService.listAppointments()

    console.log('[DEBUG CONTROLLER] Service returned data type:', typeof data)

    console.log('[DEBUG CONTROLLER] Service returned data length:', Array.isArray(data) ? data.length : 'not array')

    console.log('[DEBUG CONTROLLER] Sample service data:', Array.isArray(data) ? data.slice(0, 2) : data)

    console.log('[DEBUG CONTROLLER] Sample item fields:', Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : 'no data')

    console.log('[DEBUG CONTROLLER] About to send response:', { ok: true, data })

    res.json({ ok: true, data })

  } catch (error) {

    console.error('[DEBUG CONTROLLER] Error in getAppointments:', error)

    res.status(500).json({ ok: false, error: error.message })

  }

})



const postAppointment = asyncHandler(async (req, res) => {

  console.log('[DEBUG CONTROLLER] postAppointment called')

  console.log('[DEBUG CONTROLLER] Request body:', req.body)

  try {

    const { customerUserId, serviceId, serviceIds, staffId, date, time } = req.body || {}

    const hasService = (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) || serviceId;

    console.log('[DEBUG CONTROLLER] Extracted request data:', { customerUserId, serviceId, serviceIds, staffId, date, time })

    if (!customerUserId || !hasService || !staffId || !date || !time) {

      console.log('[DEBUG CONTROLLER] Validation failed, sending error response')

      res.status(400).json({ 

        ok: false, 

        error: 'Missing customerUserId/services/staffId/date/time' 

      })

      return

    }

    console.log('[DEBUG CONTROLLER] Validation passed, calling service')

    const data = await appointmentsService.createAppointment(req.body)

    console.log('[DEBUG CONTROLLER] Service returned data:', data)

    console.log('[DEBUG CONTROLLER] About to send response:', { ok: true, data })

    res.status(201).json({ ok: true, data })

  } catch (error) {

    console.error('[DEBUG CONTROLLER] Error in postAppointment:', error)

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