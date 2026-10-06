import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pagination = (q: any) => {
  const limit = Math.min(Math.max(Number.parseInt(String(q.limit ?? "20"), 10) || 20, 1), 100);
  const offset = Math.min(Math.max(Number.parseInt(String(q.offset ?? "0"), 10) || 0, 0), 100000);
  return { limit, offset };
};

router.post("/:watchlistId", requireAuth, async (req, res) => {
  let client: any;
  try {
    const db = initDb();
    const userId = (req as any).userId;
    const watchlistId = String(req.params.watchlistId);
    const key = req.header("idempotency-key")?.trim();
    if (!UUID.test(watchlistId)) return res.status(400).json({ error: "invalid watchlist id" });
    if (!key || key.length > 200) return res.status(400).json({ error: "idempotency-key is required" });

    const existing = await db.query(
      "SELECT id, watchlist_id, price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",
      [userId, key],
    );
    if (existing.rowCount) return res.status(200).json({
      id: existing.rows[0].id, watchlistId: existing.rows[0].watchlist_id,
      price: Number(existing.rows[0].price), duplicate: true,
    });

    const watchlist = await db.query(
      "SELECT id, target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",
      [watchlistId, userId],
    );
    if (!watchlist.rowCount) return res.status(404).json({ error: "active watchlist not found" });

    const price = Number(req.body?.price);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
      return res.status(400).json({ error: "valid price is required" });
    }

    client = await db.connect();
    await client.query("BEGIN");
    const id = randomUUID();
    try {
      await client.query(
        "INSERT INTO shopping_price_checks (id,user_id,watchlist_id,price,merchant,url,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, userId, watchlistId, price, req.body?.merchant ?? null, req.body?.url ?? null, key],
      );
    } catch (error) {
      if ((error as any)?.code === "23505") {
        const duplicate = await client.query(
          "SELECT id, watchlist_id, price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",
          [userId, key],
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return res.status(200).json({
            id: duplicate.rows[0].id, watchlistId: duplicate.rows[0].watchlist_id,
            price: Number(duplicate.rows[0].price), duplicate: true,
          });
        }
      }
      throw error;
    }
    await client.query("COMMIT");
    return res.status(201).json({
      id, watchlistId, price,
      targetPrice: watchlist.rows[0].target_price == null ? null : Number(watchlist.rows[0].target_price),
      duplicate: false,
    });
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({ error: "failed to record price" });
  } finally {
    client?.release();
  }
});

router.get("/:watchlistId", requireAuth, async (req, res) => {
  try {
    const watchlistId = String(req.params.watchlistId);
    if (!UUID.test(watchlistId)) return res.status(400).json({ error: "invalid watchlist id" });
    const { limit, offset } = pagination(req.query);
    const db = initDb();
    const userId = (req as any).userId;
    const rows = await db.query(
      "SELECT id,price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT $3 OFFSET $4",
      [watchlistId, userId, limit, offset],
    );
    const count = await db.query(
      "SELECT COUNT(*)::int count FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2",
      [watchlistId, userId],
    );
    return res.json({
      checks: rows.rows,
      pagination: { limit, offset, hasMore: offset + rows.rows.length < Number(count.rows[0].count), total: Number(count.rows[0].count) },
    });
  } catch {
    return res.status(500).json({ error: "failed to load price checks" });
  }
});

router.get("/:watchlistId/decision", requireAuth, async (req, res) => {try{const watchlistId=String(req.params.watchlistId);if(!UUID.test(watchlistId))return res.status(400).json({error:"invalid watchlist id"});const db=initDb();const userId=(req as any).userId;const w=await db.query("SELECT id,target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",[watchlistId,userId]);if(!w.rowCount)return res.status(404).json({error:"active watchlist not found"});const r=await db.query("SELECT price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT 100",[watchlistId,userId]);if(!r.rowCount)return res.json({decision:"insufficient_data",reason:"no price observations",observations:0});const prices=r.rows.map((x:any)=>Number(x.price)).filter((x:number)=>Number.isFinite(x));const latest=r.rows[0];const previous=r.rows[1]||null;const min=Math.min(...prices),max=Math.max(...prices),avg=prices.reduce((a:number,b:number)=>a+b,0)/prices.length;const latestPrice=Number(latest.price);const previousPrice=previous?Number(previous.price):null;const changePercent=previousPrice!=null&&previousPrice!==0?Math.round((latestPrice-previousPrice)/previousPrice*10000)/100:null;const target=w.rows[0].target_price==null?null:Number(w.rows[0].target_price);const targetReached=target!=null&&min<=target;const spread=max-min;const normalizedSpread=avg>0?spread/avg:1;const confidence=prices.length>=10&&normalizedSpread<=0.1?"high":prices.length>=3&&normalizedSpread<=0.2?"medium":"low";res.json({decision:targetReached?"buy_signal":"monitor",reason:targetReached?"observed price reached the configured target":"target not reached by observed prices",targetPrice:target,observations:prices.length,confidence,latest:{price:latestPrice,merchant:latest.merchant,url:latest.url,checkedAt:latest.checked_at},trend:{previousPrice,changePercent},range:{min,max,average:Math.round(avg*100)/100,spread:Math.round(spread*100)/100},disclaimer:"Decision uses recorded observations only; no purchase is executed by this endpoint."})}catch{res.status(500).json({error:"failed to build shopping decision"})}});

router.get("/:watchlistId/compare", requireAuth, async (req,res)=>{try{const watchlistId=String(req.params.watchlistId),uid=(req as any).userId;if(!UUID.test(watchlistId))return res.status(400).json({error:"invalid watchlist id"});const db=initDb();const w=await db.query("SELECT id,name,target_price,budget,currency FROM shopping_watchlists WHERE id=$1 AND user_id=$2",[watchlistId,uid]);if(!w.rowCount)return res.status(404).json({error:"watchlist not found"});const rows=await db.query("SELECT merchant,price,url,checked_at FROM (SELECT pc.merchant,pc.price,pc.url,pc.checked_at,ROW_NUMBER() OVER(PARTITION BY COALESCE(pc.merchant,'unknown') ORDER BY pc.checked_at DESC,pc.id DESC) rn FROM shopping_price_checks pc WHERE pc.watchlist_id=$1 AND pc.user_id=$2) x WHERE rn=1 ORDER BY price ASC",[watchlistId,uid]);const target=w.rows[0].target_price==null?null:Number(w.rows[0].target_price);const budget=w.rows[0].budget==null?null:Number(w.rows[0].budget);const comparison=rows.rows.map((r:any)=>{const price=Number(r.price);return {...r,price,vsTargetPercent:target&&target>0?Math.round((price-target)/target*10000)/100:null,withinTarget:target!=null&&price<=target,withinBudget:budget!=null&&price<=budget}});res.json({watchlist:w.rows[0],comparison,best:comparison[0]||null,disclaimer:"Comparison uses the latest recorded observation for each merchant; availability, shipping and purchase execution are not inferred."})}catch{res.status(500).json({error:"failed to compare merchants"})}});

router.get("/:watchlistId/alerts", requireAuth, async (req, res) => {
  try {
    const watchlistId = String(req.params.watchlistId);
    if (!UUID.test(watchlistId)) return res.status(400).json({ error: "invalid watchlist id" });
    const { limit, offset } = pagination(req.query);
    const db = initDb();
    const userId = (req as any).userId;
    const rows = await db.query(
      "SELECT id,price_check_id,price,target_price,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
      [watchlistId, userId, limit, offset],
    );
    const count = await db.query(
      "SELECT COUNT(*)::int count FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2",
      [watchlistId, userId],
    );
    return res.json({
      alerts: rows.rows,
      pagination: { limit, offset, hasMore: offset + rows.rows.length < Number(count.rows[0].count), total: Number(count.rows[0].count) },
    });
  } catch {
    return res.status(500).json({ error: "failed to load price alerts" });
  }
});

export default router;
