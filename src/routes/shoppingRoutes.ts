import { Router } from "express";
import { randomUUID } from "node:crypto";
import { planShopping } from "../services/shoppingService.js";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
router.post("/plan",requireAuth,async(req,res)=>{try{
  const plan=await planShopping(req.body||{}); const db=await initDb();
  const id=randomUUID(); const userId=(req as any).userId;
  await db.query("INSERT INTO shopping_plans (id,user_id,query,budget,currency,preferences) VALUES ($1,$2,$3,$4,$5,$6)",[id,userId,plan.intent.query,plan.intent.budget??null,plan.intent.currency||"BRL",JSON.stringify(plan.intent.preferences||[])]);
  res.status(201).json({id,...plan});
}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid shopping request"});}});
router.get("/plans",requireAuth,async(req,res)=>{try{const r=await initDb().query("SELECT id,query,budget,currency,preferences,created_at FROM shopping_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[(req as any).userId]);res.json({plans:r.rows});}catch{res.status(500).json({error:"failed to load plans"});}});
export default router;