const { query } = require('./src/config/query')
const n = require('./src/services/notifications.service')

;(async () => {
  const ownerRes = await query(
    "SELECT TOP 1 UserId, Email, Name, RoleKey FROM Users WHERE Email IS NOT NULL AND LTRIM(RTRIM(Email))<>'' AND LOWER(LTRIM(RTRIM(ISNULL(RoleKey,'')))) IN ('owner','admin','1') ORDER BY CreatedAt DESC",
    {},
  )
  const custRes = await query(
    "SELECT TOP 1 UserId, Email, Name, RoleKey FROM Users WHERE Email IS NOT NULL AND LTRIM(RTRIM(Email))<>'' AND LOWER(LTRIM(RTRIM(ISNULL(RoleKey,'')))) IN ('customer','user','3') ORDER BY CreatedAt DESC",
    {},
  )

  const owner = ownerRes.recordset?.[0]
  const customer = custRes.recordset?.[0]

  if (!owner || !customer) {
    console.log('TEST_ABORT_MISSING_USERS', { owner: !!owner, customer: !!customer })
    return
  }

  const stamp = Date.now()

  const customerResult = await n.notifyCustomerEvent({
    userId: String(customer.UserId),
    event: 'booking_reminder_2h',
    payload: {
      bookingTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      body: `[TEST] Mau email tieng Viet chuyen nghiep cho khach hang - ${stamp}`,
    },
    sendEmailNow: true,
  })

  const ownerResult = await n.notifyOwnerEvent({
    event: 'revenue_report_daily',
    payload: {
      body: `[TEST] Mau email tieng Viet chuyen nghiep cho chu tiem - ${stamp}`,
    },
    sendEmailOverride: true,
  })

  console.log('TEST_OWNER_USER', owner)
  console.log('TEST_CUSTOMER_USER', customer)
  console.log('TEST_CUSTOMER_MAIL_RESULT', customerResult)
  console.log('TEST_OWNER_MAIL_RESULT', ownerResult)
})().catch((err) => {
  console.error('TEST_MAIL_ERROR', err?.stack || err?.message || err)
  process.exit(1)
})
