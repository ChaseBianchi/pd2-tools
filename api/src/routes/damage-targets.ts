import { Router } from "express";
import { getCombatCatalog } from "../utils/combat-data";
const router = Router();
router.get("/", (_req, res) => {
  res.json(getCombatCatalog());
});
export default router;
