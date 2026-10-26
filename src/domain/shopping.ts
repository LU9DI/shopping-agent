export type ShoppingIntent={query:string;budget?:number;currency?:string;preferences?:string[]};
export type ShoppingCandidate={title:string;url?:string;price?:number;merchant?:string;score?:number};
export function normalizeIntent(input:ShoppingIntent){return{query:String(input.query||"").trim(),budget:input.budget&&input.budget>0?input.budget:undefined,currency:input.currency||"BRL",preferences:(input.preferences||[]).map((value)=>String(value).trim()).filter(Boolean).slice(0,20)}}
