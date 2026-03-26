const { asyncHandler } = require('../../utils/asyncHandler');
const scheduleService = require('../../services/schedule.service');

const getSchedule = asyncHandler(async (req, res) => {
  const data = await scheduleService.getSchedule(req.query.weekStart);
  res.json({ ok: true, data });
});

const postShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.addShift(req.body);
  res.status(201).json({ ok: true, data });
});

const deleteShift = asyncHandler(async (req, res) => {
  const data = await scheduleService.deleteShift(req.body);
  res.json({ ok: true, data });
});

module.exports = {
  getSchedule,
  postShift,
  deleteShift, 
};