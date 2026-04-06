#!/usr/bin/env node
const payroll = require('../src/services/staffPayroll.service')

async function main() {
  const staffId = String(process.argv[2] || '')
  if (!staffId) {
    console.error('Usage: node scripts/dump_payroll_staff.js <staffId>')
    process.exit(1)
  }

  try {
    const data = await payroll.getPayrollOverview(staffId)
    console.log(JSON.stringify(data, null, 2))
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

if (require.main === module) main()
