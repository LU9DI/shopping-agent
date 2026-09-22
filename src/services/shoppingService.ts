import { normalizeIntent, type ShoppingIntent } from "../domain/shopping.js";
export async function planShopping(input:ShoppingIntent){const intent=normalizeIntent(input);return {intent,candidates:[]};}
