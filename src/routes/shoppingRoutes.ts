import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";

const router=Router();
const ALERT_COOLDOWN_MS=60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pagination=(q:any)=>{
  const limit=Math.min(Math.max(Number.parseInt(String(q.limit??"20"),10)||20,1),100);
  const offset=Math.min(Math.max(Number.parseInt(String(q.offset??"0"),10)||0,0),100000);
  return {limit,offset};
};

function transition(ruleType:string,previous:number|null,current:number,threshold:number|null,previousDeltaPercent:number|null){
  if(previous===null||threshold===null)return {triggered:false,reason:"no_previous_or_threshold"};
  if(ruleType==="target_price"||ruleType==="below_budget"){
    const crossed=previous>threshold&&current<=threshold;
    return {triggered:crossed,reason:crossed?"threshold_crossed":"threshold_not_crossed"};
  }
  if(ruleType==="drop_percent"){
    if(previous<=0)return {triggered:false,reason:"invalid_previous_price"};
    const previousDrop=previousDeltaPercent===null?0:Math.max(0,-previousDeltaPercent);
    const currentDrop=((previous-current)/previous)*100;
    return {triggered:currentDrop>=threshold&&previousDrop<threshold,reason:currentDrop>=threshold?"drop_threshold_crossed":"drop_threshold_not_crossed",currentDropPercent:currentDrop};
  }
  return {triggered:false,reason:"unsupported_rule"};
}

router.post("/:watchlistId",requireAuth,async(req,res)=>{
  let client:any;
  try{
    const db=initDb(),userId=(req as any).userId,watchlistId=String(req.params.watchlistId);
    if(!UUID.test(watchlistId))return res.status(400).json({error:"invalid watchlist id"});
    const key=req.header("idempotency-key")?.trim();
    if(!key||key.length>200)return res.status(400).json({error:"idempotency-key is required"});
    const existing=await db.query("SELECT id,watchlist_id,price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",[userId,key]);
    if(existing.rowCount)return res.status(200).json({id:existing.rows[0].id,watchlistId:existing.rows[0].watchlist_id,price:Number(existing.rows[0].price),duplicate:true});

    const w=await db.query("SELECT id,name,target_price,budget,currency FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",[watchlistId,userId]);
    if(!w.rowCount)return res.status(404).json({error:"active watchlist not found"});

    const price=Number(req.body?.price);
    if(!Number.isFinite(price)||price<0||price>1_000_000_000)return res.status(400).json({error:"valid price is required"});
    const merchant=req.body?.merchant;
    if(merchant!==undefined&&merchant!==null&&(typeof merchant!=="string"||merchant.length>200))return res.status(400).json({error:"invalid merchant"});
    const url=req.body?.url;
    if(url!==undefined&&url!==null){
      if(typeof url!=="string"||url.length>2048)return res.status(400).json({error:"invalid url"});
      try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))return res.status(400).json({error:"invalid url"});}
      catch{return res.status(400).json({error:"invalid url"});}
    }

    client=await db.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[watchlistId]);

    const previousResult=await client.query(
      "SELECT id,price,merchant,currency,checked_at,delta_percent FROM price_history WHERE watchlist_id=$1 ORDER BY checked_at DESC LIMIT 1",
      [watchlistId]
    );
    const previous=previousResult.rows[0]?Number(previousResult.rows[0].price):null;\n    const previousDeltaPercent=previousResult.rows[0]?.delta_percent==null?null:Number(previousResult.rows[0].delta_percent);
    const delta=previous===null?null:Math.round((price-previous)*100)/100;
    const deltaPercent=previous&&previous!==0?Math.round(((price-previous)/previous)*1000000)/10000:null;

    const id=randomUUID();
    try{
      await client.query(
        "INSERT INTO shopping_price_checks (id,user_id,watchlist_id,price,merchant,url,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id,userId,watchlistId,price,merchant??null,url??null,key]
      );
    }catch(e){
      if((e as any)?.code==="23505"){
        const duplicate=await client.query("SELECT id,watchlist_id,price FROM shopping_price_checks WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1",[userId,key]);
        if(duplicate.rowCount){await client.query("ROLLBACK");return res.status(200).json({id:duplicate.rows[0].id,watchlistId:duplicate.rows[0].watchlist_id,price:Number(duplicate.rows[0].price),duplicate:true});}
      }
      throw e;
    }

    await client.query(
      "INSERT INTO price_history(id,watchlist_id,price,currency,merchant,checked_at,previous_price,price_check_id,delta,delta_percent) VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8,$9)",
      [randomUUID(),watchlistId,price,w.rows[0].currency||"BRL",merchant??null,previous,id,delta,deltaPercent]
    );

    const rules=await client.query(
      "SELECT id,rule_type,threshold,enabled FROM alert_rules WHERE watchlist_id=$1 AND user_id=$2 AND enabled=true ORDER BY created_at ASC",
      [watchlistId,userId]
    );

    const events:any[]=[];
    for(const rule of rules.rows){
      const threshold=rule.threshold===null?null:Number(rule.threshold);
      const evaluation=transition(rule.rule_type,previous,price,threshold,previousDeltaPercent);
      if(!evaluation.triggered)continue;

      const bucketStart=new Date(Math.floor(Date.now()/ALERT_COOLDOWN_MS)*ALERT_COOLDOWN_MS);
      const reason={
        transition:"edge",
        previousPrice:previous,
        currentPrice:price,
        delta,
        deltaPercent,
        ruleType:rule.rule_type,
        threshold,
        evaluation
      };

      const inserted=await client.query(
        `INSERT INTO alert_events(id,user_id,watchlist_id,alert_rule_id,price_check_id,rule_type,threshold,previous_price,current_price,delta,delta_percent,dedupe_window_start,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT(alert_rule_id,dedupe_window_start) DO NOTHING
         RETURNING id,triggered_at`,
        [randomUUID(),userId,watchlistId,rule.id,id,rule.rule_type,threshold,previous,price,delta,deltaPercent,bucketStart,JSON.stringify(reason)]
      );
      if(inserted.rowCount){
        events.push({id:inserted.rows[0].id,ruleId:rule.id,ruleType:rule.rule_type,threshold,previousPrice:previous,currentPrice:price,delta,deltaPercent,triggeredAt:inserted.rows[0].triggered_at});
        await client.query(
          "INSERT INTO shopping_price_alerts(id,user_id,watchlist_id,price_check_id,target_price,price,alert_rule_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [randomUUID(),userId,watchlistId,id,rule.rule_type==="target_price"||rule.rule_type==="below_budget"?threshold:null,price,rule.id]
        );
      }
    }

    // Backward-compatible implicit target alert when no explicit rules exist.
    if(!rules.rowCount&&w.rows[0].target_price!=null&&previous!==null&&previous>Number(w.rows[0].target_price)&&price<=Number(w.rows[0].target_price)){
      const threshold=Number(w.rows[0].target_price);
      const bucketStart=new Date(Math.floor(Date.now()/ALERT_COOLDOWN_MS)*ALERT_COOLDOWN_MS);
      const pseudoRule=await client.query(
        "SELECT id FROM alert_rules WHERE watchlist_id=$1 AND user_id=$2 AND rule_type='target_price' AND threshold=$3 LIMIT 1",
        [watchlistId,userId,threshold]
      );
      let ruleId=pseudoRule.rows[0]?.id;
      if(!ruleId){
        const created=await client.query("INSERT INTO alert_rules(id,user_id,watchlist_id,rule_type,threshold) VALUES($1,$2,$3,'target_price',$4) RETURNING id",[randomUUID(),userId,watchlistId,threshold]);
        ruleId=created.rows[0].id;
      }
      const inserted=await client.query(
        `INSERT INTO alert_events(id,user_id,watchlist_id,alert_rule_id,price_check_id,rule_type,threshold,previous_price,current_price,delta,delta_percent,dedupe_window_start,reason)
         VALUES($1,$2,$3,$4,$5,'target_price',$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT(alert_rule_id,dedupe_window_start) DO NOTHING RETURNING id,triggered_at`,
        [randomUUID(),userId,watchlistId,ruleId,id,threshold,previous,price,delta,deltaPercent,bucketStart,JSON.stringify({transition:"edge",implicit:true,previousPrice:previous,currentPrice:price,delta,deltaPercent,threshold})]
      );
      if(inserted.rowCount){
        events.push({id:inserted.rows[0].id,ruleId,ruleType:"target_price",threshold,previousPrice:previous,currentPrice:price,delta,deltaPercent,triggeredAt:inserted.rows[0].triggered_at});
        await client.query("INSERT INTO shopping_price_alerts(id,user_id,watchlist_id,price_check_id,target_price,price,alert_rule_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),userId,watchlistId,id,threshold,price,ruleId]);
      }
    }

    await client.query("COMMIT");
    res.status(201).json({id,watchlistId,price,previousPrice:previous,delta,deltaPercent,alerts:events,alert:Boolean(events.length),duplicate:false});
  }catch(error:any){
    if(client)await client.query("ROLLBACK").catch(()=>{});
    res.status(error?.code==="23505"?409:400).json({error:"failed to record price"});
  }finally{client?.release();}
});

router.get("/:watchlistId",requireAuth,async(req,res)=>{
  try{
    if(!UUID.test(String(req.params.watchlistId)))return res.status(400).json({error:"invalid watchlist id"});
    const {limit,offset}=pagination(req.query),db=initDb();
    const r=await db.query("SELECT id,price,merchant,url,checked_at FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2 ORDER BY checked_at DESC LIMIT $3 OFFSET $4",[req.params.watchlistId,(req as any).userId,limit,offset]);
    const c=await db.query("SELECT COUNT(*)::int count FROM shopping_price_checks WHERE watchlist_id=$1 AND user_id=$2",[req.params.watchlistId,(req as any).userId]);
    res.json({checks:r.rows,pagination:{limit,offset,hasMore:offset+r.rows.length<Number(c.rows[0].count),total:Number(c.rows[0].count)}});
  }catch{res.status(500).json({error:"failed to load price checks"});}
});

router.get("/:watchlistId/alerts",requireAuth,async(req,res)=>{
  try{
    if(!UUID.test(String(req.params.watchlistId)))return res.status(400).json({error:"invalid watchlist id"});
    const {limit,offset}=pagination(req.query),db=initDb();
    const r=await db.query("SELECT id,price_check_id,price,target_price,alert_rule_id,created_at FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",[req.params.watchlistId,(req as any).userId,limit,offset]);
    const c=await db.query("SELECT COUNT(*)::int count FROM shopping_price_alerts WHERE watchlist_id=$1 AND user_id=$2",[req.params.watchlistId,(req as any).userId]);
    res.json({alerts:r.rows,pagination:{limit,offset,hasMore:offset+r.rows.length<Number(c.rows[0].count),total:Number(c.rows[0].count)}});
  }catch{res.status(500).json({error:"failed to load price alerts"});}
});

router.get("/:watchlistId/alert-events",requireAuth,async(req,res)=>{
  try{
    const watchlistId=String(req.params.watchlistId);
    if(!UUID.test(watchlistId))return res.status(400).json({error:"invalid watchlist id"});
    const {limit,offset}=pagination(req.query),db=initDb();
    const own=await db.query("SELECT id,name,currency FROM shopping_watchlists WHERE id=$1 AND user_id=$2",[watchlistId,(req as any).userId]);
    if(!own.rowCount)return res.status(404).json({error:"watchlist not found"});
    const r=await db.query(
      "SELECT id,alert_rule_id,price_check_id,rule_type,threshold,previous_price,current_price,delta,delta_percent,dedupe_window_start,reason,triggered_at FROM alert_events WHERE watchlist_id=$1 AND user_id=$2 ORDER BY triggered_at DESC LIMIT $3 OFFSET $4",
      [watchlistId,(req as any).userId,limit,offset]
    );
    const c=await db.query("SELECT COUNT(*)::int count FROM alert_events WHERE watchlist_id=$1 AND user_id=$2",[watchlistId,(req as any).userId]);
    res.json({watchlist:own.rows[0],events:r.rows,pagination:{limit,offset,total:Number(c.rows[0].count),hasMore:offset+r.rows.length<Number(c.rows[0].count)}});
  }catch{res.status(500).json({error:"failed to load alert events"});}
});

export default router;
