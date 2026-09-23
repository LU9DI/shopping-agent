import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
const ALERT_COOLDOWN_MS=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
router.post("/:watchlistId",requireAuth,async(req,res)=>{let client:any;try{
 const db=initDb();const userId=(req as any).userId;if(!UUID.test(String(req.params.watchlistId)))return res.status(400).json({error:"invalid watchlist id"});
 const key=req.header("idempotency-key")?.trim();if(!key||key.length>200)return res.status(400).json({error:"idempotency-key is required"});
 const existing=await db.query("SELECT id,watchlist_id,price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",[userId,key]);if(existing.rowCount)return res.status(200).json({id:existing.rows[0].id,watchlistId:existing.rows[0].watchlist_id,price:Number(existing.rows[0].price),duplicate:true});
 const w=await db.query("SELECT id,name,target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",[req.params.watchlistId,userId]);if(!w.rowCount)return res.status(404).json({error:"active watchlist not found"});
 const price=Number(req.body?.price);if(!Number.isFinite(price)||price<0||price>1_000_000_000)return res.status(400).json({error:"valid price is required"});
 const merchant=req.body?.merchant;if(merchant!==undefined&&merchant!==null&&(typeof merchant!=="string"||merchant.length>200))return res.status(400).json({error:"invalid merchant"});
 const url=req.body?.url;if(url!==undefined&&url!==null){if(typeof url!=="string"||url.length>2048)return res.status(400).json({error:"invalid url"});try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))return res.status(400).json({error:"invalid url"});}catch{return res.status(400).json({error:"invalid url"});}}
 client=await db.connect();await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[req.params.watchlistId]);const id=randomUUID();
 try{await client.query("INSERT INTO shopping_price_checks (id,user_id,watchlist_id,price,merchant,url,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",[id,userId,req.params.watchlistId,price,merchant??null,url??null,key]);}
 catch(e){if((e as any)?.code==="23505"){const duplicate=await client.query("SELECT id,watchlist_id,price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",[userId,key]);if(duplicate.rowCount){await client.query("ROLLBACK");return res.status(200).json({id:duplicate.rows[0].id,watchlistId:duplicate.rows[0].watchlist_id,price:Number(duplicate.rows[0].price),duplicate:true});}}throw e;}
 const target=w.rows[0].target_price==null?null:Number(w.rows[0].target_price);let alert=false;
 if(target!==null&&price<=target){const previous=await client.query("SELECT price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1",[req.params.watchlistId,userId]);const last=previous.rows[0];const lowerThanLast=!!last&&price<Number(last.price);const cooldownExpired=!last||Date.now()-new Date(last.created_at).getTime()>=ALERT_COOLDOWN_MS;alert=!last||lowerThanLast||cooldownExpired;if(alert)await client.query("INSERT INTO shopping_price_alerts (id,user_id,watchlist_id,price_check_id,target_price,price) VALUES ($1,$2,$3,$4,$5,$6)",[randomUUID(),userId,req.params.watchlistId,id,target,price]);}
 await client.query("COMMIT");res.status(201).json({id,watchlistId:req.params.watchlistId,price,targetPrice:target,alert,duplicate:false});
}catch{if(client)await client.query("ROLLBACK").catch(()=>{});res.status(400).json({error:"failed to record price"});}finally{client?.release();}});
router.get("/:watchlistId",requireAuth,async(req,res)=>{try{if(!UUID.test(String(req.params.watchlistId)))return res.status(400).json({error:"invalid watchlist id"});const r=await initDb().query("SELECT id,price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);res.json({checks:r.rows});}catch{res.status(500).json({error:"failed to load price checks"});}});
router.get("/:watchlistId/alerts",requireAuth,async(req,res)=>{try{if(!UUID.test(String(req.params.watchlistId)))return res.status(400).json({error:"invalid watchlist id"});const r=await initDb().query("SELECT id,price_check_id,price,target_price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100",[req.params.watchlistId,(req as any).userId]);res.json({alerts:r.rows});}catch{res.status(500).json({error:"failed to load price alerts"});}});
export default router;