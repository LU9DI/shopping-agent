import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIntent } from "../src/domain/shopping.js";
test("normalizes shopping intent",()=>{const x=normalizeIntent({query:"  laptop  ",budget:1000,preferences:[" gaming "]});assert.equal(x.query,"laptop");assert.deepEqual(x.preferences,["gaming"]);});
