/** Bounded, stable-order concurrent reads; errors fail the entire archive. */
export async function mapConcurrent<T,U>(values:readonly T[],limit:number,load:(v:T)=>Promise<U>):Promise<U[]>{
 if(!Number.isInteger(limit)||limit<1)throw Error("Invalid concurrency");
 const results:U[]=new Array(values.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{
  for(;;){
   const index=next++;
   if(index>=values.length)return;
   results[index]=await load(values[index]);
  }
 }));
 return results;
}
