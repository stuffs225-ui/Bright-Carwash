/** Device-only UI preference: never part of the price or finance source of truth. */
export type QuickPreset={id:string;car_type:string;service_type:string;amount:number;sort_order?:number};
export type RecentByCar=Record<string,string>;
export const RECENT_SERVICE_STORAGE_KEY="carwash_last_service_per_car_v1";
export function parseRecentByCar(raw:unknown):RecentByCar{
 if(typeof raw!=="string"||raw.length>2048)return {};
 try{
  const value=JSON.parse(raw) as Record<string,unknown>;
  if(!value||Array.isArray(value)||typeof value!=="object")return {};
  const out:RecentByCar={};
  for(const [key,id] of Object.entries(value)){
   if(key.length>0&&key.length<=80&&typeof id==="string"&&
      /^[a-f0-9-]{36}$/i.test(id)&&Object.keys(out).length<15)out[key]=id;
  }
  return out;
 }catch{return {};}
}
export function recommendedForCar<T extends QuickPreset>(
 presets:readonly T[],carType:string,recent:RecentByCar
):T[]{
 return presets.filter(p=>p.car_type===carType).sort((a,b)=>{
  if(a.id===recent[carType])return -1;
  if(b.id===recent[carType])return 1;
  return Number(a.sort_order??9999)-Number(b.sort_order??9999);
 });
}
export function recentPresetForCar<T extends QuickPreset>(
 presets:readonly T[],carType:string,recent:RecentByCar
):T|null{
 const id=recent[carType];
 return presets.find(p=>p.car_type===carType&&p.id===id)||null;
}
