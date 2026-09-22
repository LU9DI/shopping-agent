import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
const ALERT_COOLDOWN_MS=24*60*60*1000;
router.post("/:watchlistId",requireAuth,async(req,res)=>{let client:any;try{
  const db=initDb(); const userId=(req as any).userId;
  const w=await db.query("SELECT id,name,target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",[req.params.watchlistId,userId]);
  if(!w.rowCount)return res.status(404).json({error:"active watchlist not found"});
  const price=Number(req.body?.price);
  if(!Number.isFinite(price)||price<0)return res.status(400).json({error:"valid price is required"});
  client=await db.connect(); await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[req.params.watchlistId]);
  const id=randomUUID();
  await client.query("INSERT INTO shopping_price_checks (id,user_id,watchlist_id,price,merchant,url) VALUES ($1,$2,$3,$4,$5,$6)",[id,userId,req.params.watchlistId,price,req.body?.merchant||null,req.body?.url||null]);
  const target=w.rows[0].target_price==null?null:Number(w.rows[0].target_price);
  let alert=false;
  if(target!==null&&price<=target){
    const previous=await client.query("SELECT price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1",[req.params.watchlistId,userId]);
    const last=previous.rows[0];
    const lowerThanLast=!!last&&price<Number(last.price);
    const cooldownExpired=!last||Date.now()-new Date(last.created_at).getTime()>=ALERT_COOLDOWN_MS;
    alert=!last||lowerThanLast||cooldownExpired;
    if(alert) await client.query("INSERT INTO shopping_price_alerts (id,user_id,watchlist_id,price_check_id,target_price,price) VALUES ($1,$2,$3,$4,$5,$6)",[randomUUID(),userId,req.params.watchlistId,id,target,price]);
  }
  await client.query("COMMIT");
  res.status(201).json({id,watchlistId:req.params.watchlistId,price,targetPrice:target,alert});
}catch(e){if(client)await client.query("ROLLBACK").catch(()=>{});res.status(400).json({error:e instanceof Error?e.message:"failed to record price"});}finally{client?.release();}});
router.get("/:watchlistId",requireAuth,async(req,res)=>{try{
  const r=await initDb().query("SELECT id,price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);
  res.json({checks:r.rows});
}catch{res.status(500).json({error:"failed to load price checks"});}});
router.get("/:watchlistId/alerts",requireAuth,async(req,res)=>{try{
  const r=await initDb().query("SELECT id,price_check_id,price,target_price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);
  res.json({alerts:r.rows});
}catch{res.status(500).json({error:"failed to load price alerts"});}});
export default router;