import test from "node:test";
import assert from "node:assert/strict";
import { assertEntitlement, type Entitlement } from "../src/core/platformGovernance.js";
const e=(plan:string,limit:number|null,allowed=true):Entitlement=>({plan,limit,allowed});
test("plan entitlement matrix enforces free/pro/business watchlist limits",()=>{assert.doesNotThrow(()=>assertEntitlement(e("free",10),"watchlists",9));assert.throws(()=>assertEntitlement(e("free",10),"watchlists",10),/limit reached/);assert.doesNotThrow(()=>assertEntitlement(e("pro",100),"watchlists",99));assert.throws(()=>assertEntitlement(e("pro",100),"watchlists",100),/limit reached/);assert.doesNotThrow(()=>assertEntitlement(e("business",1000),"watchlists",999));assert.throws(()=>assertEntitlement(e("business",1000),"watchlists",1000),/limit reached/);});
test("disabled entitlement is denied",()=>{assert.throws(()=>assertEntitlement(e("free",0,false),"advanced_analytics",0),/feature disabled/);});
