const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/serviceController");
const { validateService } = require("../middlewares/validators");

router.get("/", serviceController.getServices);
router.get("/salon/:salonId", serviceController.getServicesBySalon);
router.get("/:id", serviceController.getDetail);
router.post('/', validateService, serviceController.createService);
router.put('/:id', validateService, serviceController.updateService);
router.delete('/:id', serviceController.deleteService);

module.exports = router;
