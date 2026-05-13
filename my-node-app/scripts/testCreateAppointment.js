const appointmentsService = require('../src/services/appointments.service')

async function run() {
  try {
    const meta = await appointmentsService.listAppointmentMeta({ staffId: '' })
    console.log('meta customers:', (meta.customers || []).length, 'services:', (meta.services || []).length)
    const firstService = (meta.services || [])[0]
    if (!firstService) {
      console.error('No services available to test')
      process.exit(1)
    }

    // Try to find a staff who supports this service
    const { query } = require('../src/config/query')
    const serviceId = String(firstService.id || firstService.ServiceId || firstService.serviceId || firstService.ServiceId || '').trim()
    // Try to find a StaffId/ServiceId pair directly from StaffSkills to ensure matching
    let pair = { recordset: [] }
    try {
      pair = await query('SELECT TOP 1 StaffId, ServiceId FROM StaffSkills')
    } catch (e) {}

    let staffRes = { recordset: [] }
    try {
      staffRes = await query('SELECT TOP 1 StaffId FROM StaffSkills WHERE ServiceId = @serviceId', { serviceId })
    } catch (e) {
      // ignore
    }

    let staffId = staffRes.recordset?.[0]?.StaffId || pair.recordset?.[0]?.StaffId || null
    // If pair exists and no specific staff was found for service, use pair's serviceId
    if (!serviceId && pair.recordset?.[0]?.ServiceId) {
      serviceId = String(pair.recordset[0].ServiceId)
    }
    // Fallback: pick any staff from Staff table if StaffSkills lookup failed
    if (!staffId) {
      try {
        const anyStaff = await query('SELECT TOP 1 StaffId FROM Staff')
        staffId = anyStaff.recordset?.[0]?.StaffId || null
      } catch (e) {
        // ignore
      }
    }

    // If we still don't have a service mapping for this staff, try to pick a service that the staff actually supports
    if (staffId) {
      try {
        const svcForStaff = await query('SELECT TOP 1 ServiceId FROM StaffSkills WHERE StaffId = @staffId', { staffId })
        const svcId = svcForStaff.recordset?.[0]?.ServiceId
        if (svcId) {
          console.log('[test] Overriding serviceId to one that staff supports:', svcId)
          serviceId = String(svcId)
        }
      } catch (e) {}
    }

    const payload = {
      customerUserId: null,
      customerName: 'Test Walkin Script',
      customerPhone: '0900000000',
      serviceIds: [serviceId].filter(Boolean),
      date: new Date().toISOString().slice(0,10),
      time: '12:00',
      notes: 'Created by automated test script',
      status: 'Pending',
    }
    if (staffId) payload.staffId = staffId

    console.log('Creating appointment with payload:', payload)
    const res = await appointmentsService.createAppointment(payload)
    console.log('Create result:', res)
  } catch (err) {
    console.error('Test create failed:', err && (err.message || err))
    console.error(err && err.stack)
  }
}

run()
