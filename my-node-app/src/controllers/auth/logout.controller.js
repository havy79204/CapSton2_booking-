const { asyncHandler } = require('../../utils/asyncHandler')

const postLogout = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: { loggedOut: true } })
})

module.exports = {
  postLogout,
}
