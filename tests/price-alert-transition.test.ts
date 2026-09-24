import test from "node:test";
import assert from "node:assert/strict";
import { transition } from "../src/routes/shoppingRoutes.js";

test("target price triggers only when crossing the threshold",()=>{
  assert.equal(transition("target_price",120,99,100,null).triggered,true);
  assert.equal(transition("target_price",99,95,100,null).triggered,false);
});

test("below budget triggers only on the downward edge",()=>{
  assert.equal(transition("below_budget",101,100,100,null).triggered,true);
  assert.equal(transition("below_budget",100,99,100,null).triggered,false);
});

test("drop percentage triggers on threshold crossing",()=>{
  assert.equal(transition("drop_percent",100,89,10,null).triggered,true);
  assert.equal(transition("drop_percent",100,89,10,-10).triggered,false);
});

test("no previous price cannot trigger an edge alert",()=>{
  assert.equal(transition("target_price",null,90,100,null).triggered,false);
  assert.equal(transition("drop_percent",null,90,10,null).triggered,false);
});
