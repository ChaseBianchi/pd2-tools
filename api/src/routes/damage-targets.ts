import { Router } from "express";
import { getDamageTargetCatalog } from "../utils/damage-targets";

const router = Router();
router.get("/", (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(getDamageTargetCatalog());
  } catch (error) { next(error); }
});
export default router;
