const serviceService = require("../services/serviceService");

const getServices = async (req, res) => {
  try {
    const data = await serviceService.getAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDetail = async (req, res) => {
  try {
    const data = await serviceService.getById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Service not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createService = async (req, res) => {
  try {
    const payload = req.sanitizedBody || req.body;
    const created = await serviceService.create(payload);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const payload = req.sanitizedBody || req.body;
    const updated = await serviceService.update(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteService = async (req, res) => {
  try {
    const ok = await serviceService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Service not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getServicesBySalon = async (req, res) => {
  try {
    const { salonId } = req.params;
    // TODO: Implement filtering by salonId
    const data = await serviceService.getAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getServices, getDetail, createService, updateService, deleteService, getServicesBySalon };