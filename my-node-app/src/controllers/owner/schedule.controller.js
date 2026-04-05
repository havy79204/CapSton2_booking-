const { asyncHandler } = require('../../utils/asyncHandler');
const scheduleService = require('../../services/schedule.service');
const { emitStaffDataUpdated } = require('../../realtime/socket');

const getSchedule = asyncHandler(async (req, res) => {
  const data = await scheduleService.getSchedule(req.query.weekStart);
  res.json({ ok: true, data });
});

const postShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.addShift(req.body);
  emitStaffDataUpdated({ source: 'schedule', action: 'create', staffId: String(req.body?.staffId || ''), date: String(req.body?.date || '') });
  res.status(201).json({ ok: true, data });
});

const deleteShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.deleteShift(req.body);
  emitStaffDataUpdated({ source: 'schedule', action: 'delete', staffId: String(req.body?.staffId || ''), date: String(req.body?.date || '') });
  res.json({ ok: true, data });
});

module.exports = {
  getSchedule,
  postShift,
  deleteShift, 
};