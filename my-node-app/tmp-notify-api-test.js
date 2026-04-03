const { createApp } = require('./src/app')
const authService = require('./src/services/auth.service')

;(async () => {
  const app = createApp()
  const server = app.listen(0)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`

  try {
    const ownerLogin = await authService.quickLogin({ roleId: 1 })
    const customerLogin = await authService.quickLogin({ roleId: 3 })

    const ownerToken = ownerLogin?.token
    const customerToken = customerLogin?.token

    const ownerRes = await fetch(`${base}/api/owner/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    const ownerJson = await ownerRes.json()

    const ownerReadRes = await fetch(`${base}/api/owner/notifications/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: '{}',
    })
    const ownerReadJson = await ownerReadRes.json()

    const customerRes = await fetch(`${base}/api/customer/notifications`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    })
    const customerJson = await customerRes.json()

    const customerReadRes = await fetch(`${base}/api/customer/notifications/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: '{}',
    })
    const customerReadJson = await customerReadRes.json()

    console.log('OWNER_API_STATUS', ownerRes.status)
    console.log('OWNER_API_OK', ownerJson?.ok, 'COUNT', Array.isArray(ownerJson?.data) ? ownerJson.data.length : -1)
    console.log('OWNER_API_SAMPLE', ownerJson?.data?.[0])
    console.log('OWNER_READ_STATUS', ownerReadRes.status, ownerReadJson)

    console.log('CUSTOMER_API_STATUS', customerRes.status)
    console.log('CUSTOMER_API_OK', customerJson?.ok, 'COUNT', Array.isArray(customerJson?.data) ? customerJson.data.length : -1)
    console.log('CUSTOMER_API_SAMPLE', customerJson?.data?.[0])
    console.log('CUSTOMER_READ_STATUS', customerReadRes.status, customerReadJson)
  } finally {
    server.close()
  }
})().catch((err) => {
  console.error('API_TEST_ERROR', err?.stack || err?.message || err)
  process.exit(1)
})
