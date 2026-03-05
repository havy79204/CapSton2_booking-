const Service = require("../models/Service");

const getAll = async () => {
  return await Service.getAll();
};

const getById = async (id) => {
  return await Service.getById(id);
};

const create = async (data) => {
  return await Service.create(data);
};

const update = async (id, data) => {
  return await Service.update(id, data);
};

const remove = async (id) => {
  return await Service.remove(id);
};

module.exports = { getAll, getById, create, update, remove };

