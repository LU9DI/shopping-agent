import { Router } from "express";
import { planShopping } from "../services/shoppingService.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
router.post("/plan",requireAuth,async(req,res)=>{try{res.json(await planShopping(req.body||{}));}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid shopping request"});}});
export default router;
