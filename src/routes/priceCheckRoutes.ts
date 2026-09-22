import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
router.post("/:watchlistId",requireAuth,async(req,res)=>{try{
  const db=initDb(); const userId=(req as any).userId;
  const w=await db.query("SELECT id,name,target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",[req.params.watchlistId,userId]);
  if(!w.rowCount)return res.status(404).json({error:"active watchlist not found"});
  const price=Number(req.body?.price);
  if(!Number.isFinite(price)||price<0)return res.status(400).json({error:"valid price is required"});
  const id=randomUUID();
  await db.query("INSERT INTO shopping_price_checks (id,user_id,watchlist_id,price,merchant,url) VALUES ($1,$2,$3,$4,$5,$6)",[id,userId,req.params.watchlistId,price,req.body?.merchant||null,req.body?.url||null]);
  const target=w.rows[0].target_price==null?null:Number(w.rows[0].target_price);
  const alert=target!==null&&price<=target;
  if(alert) await db.query("INSERT INTO shopping_price_alerts (id,user_id,watchlist_id,price_check_id,target_price,price) VALUES ($1,$2,$3,$4,$5,$6)",[randomUUID(),userId,req.params.watchlistId,id,target,price]);
  res.status(201).json({id,watchlistId:req.params.watchlistId,price,targetPrice:target,alert});
}catch{res.status(400).json({error:"failed to record price"});}});
router.get("/:watchlistId",requireAuth,async(req,res)=>{try{
  const r=await initDb().query("SELECT id,price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);
  res.json({checks:r.rows});
}catch{res.status(500).json({error:"failed to load price checks"});}});
router.get("/:watchlistId/alerts",requireAuth,async(req,res)=>{try{
  const r=await initDb().query("SELECT id,price_check_id,price,target_price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);
  res.json({alerts:r.rows});
}catch{res.status(500).json({error:"failed to load price alerts"});}});
export default router;