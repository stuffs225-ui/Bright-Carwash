/** New registrations do not accept discounts; historical entries remain unchanged. */
export function acceptsNewRegistrationDiscount(value:unknown):value is 0 {
 return typeof value==="number"&&Number.isFinite(value)&&value===0;
}
export type CatalogPreset={car_type:string;service_type:string;amount:number;active?:boolean};
export type CatalogAddon={id:string;name:string;price:number;active?:boolean};
export function selectedAddonsTotal(catalog:CatalogAddon[],selected:string[]):number {
 if(new Set(selected).size!==selected.length || selected.length>8)throw Error("Duplicate or excessive extras");
 let cents=0;
 for(const id of selected){
  const item=catalog.find(x=>x.id===id&&x.active!==false);
  if(!item||!Number.isFinite(item.price)||item.price<0)throw Error("Unknown or inactive add-on");
  cents+=Math.round(item.price*100);
 }
 return cents/100;
}
export function isApprovedStaffPrice(input:{
 carType:string;serviceType:string;cash:number;card:number;discount:number;
 presets:CatalogPreset[];addons:CatalogAddon[];selectedAddons:string[];
}):boolean{
 const {carType,serviceType,cash,card,discount,presets,addons,selectedAddons}=input;
 if(![cash,card,discount].every(x=>Number.isFinite(x)&&x>=0))return false;
 if(discount!==0||cash+card<=0)return false;
 const addonCents=Math.round(selectedAddonsTotal(addons,selectedAddons)*100);
 const baseCents=Math.round((cash+card+discount)*100)-addonCents;
 return presets.some(x=>x.active!==false&&x.car_type===carType&&x.service_type===serviceType&&Math.round(x.amount*100)===baseCents);
}
