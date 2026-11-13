"use client";
import {useState,useRef} from "react";
import {supabase} from "@/lib/supabaseClient";
import {workerText,workerMessage,type WorkerLocale} from "@/lib/workerI18n";
type Props={date:string;token?:string;manager?:boolean;locale?:WorkerLocale;queued:number;onSent:()=>void};
async function compress(file:File):Promise<Blob>{
 if(file.size<=2.5*1024*1024&&["image/jpeg","image/png","image/webp"].includes(file.type))return file;
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,1600/Math.max(img.width,img.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("تعذر تجهيز الصورة");
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.8));
  if(!blob||blob.size>3*1024*1024)throw Error("اختر صورة أصغر");
  return blob;
 }finally{URL.revokeObjectURL(url);}
}
export function WorkerDayReport({date,token,manager=false,locale="ar",queued,onSent}:Props){
 const tt=(key:Parameters<typeof workerText>[1],vars?:Record<string,string|number>)=>workerText(locale,key,vars);
 const [cash,setCash]=useState(""),[card,setCard]=useState(""),[terminal,setTerminal]=useState("");
 const [photo,setPhoto]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const locked=useRef(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(locked.current||queued>0||!photo)return;
  if([cash,card,terminal].some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<0)){
   setError("أدخل المبالغ الثلاثة.");return;
  }
  locked.current=true;setBusy(true);setError("");
  try{
   const blob=await compress(photo);
   const form=new FormData();if(token)form.append("token",token);form.append("date",date);
   form.append("cash",cash);form.append("card",card);form.append("terminal",terminal);
   form.append("photo",blob,"report.jpg");
   const headers:Record<string,string>={};
   if(manager){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error("جلسة المدير غير متاحة");
    headers.authorization="Bearer "+session.access_token;
   }
   const res=await fetch("/api/worker-links/day-report",{method:"POST",headers,body:form,cache:"no-store"});
   const json=await res.json().catch(()=>({}));
   if(!res.ok||!json.ok)throw Error(json.error||"لم يتأكد وصول الموازنة، أعد المحاولة");
   onSent();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الموازنة");}
  finally{locked.current=false;setBusy(false);}
 }
 return <form className="card mt-3 space-y-3" onSubmit={submit}>
  <h3 className="font-bold">{tt("report.title",{date})}</h3>

  <label className="form-label">{tt("report.cash")}<input type="number" min="0" step=".01" inputMode="decimal" required value={cash} onChange={e=>setCash(e.target.value)}/></label>
  <label className="form-label">{tt("report.pos")}<input type="number" min="0" step=".01" inputMode="decimal" required value={card} onChange={e=>setCard(e.target.value)}/></label>
  <label className="form-label">{tt("report.terminal")}<input type="number" min="0" step=".01" inputMode="decimal" required value={terminal} onChange={e=>setTerminal(e.target.value)}/></label>
  <label className="form-label">{tt("report.photo")}<input type="file" accept="image/*" capture="environment" required onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
  {queued>0&&<p className="txt-warning text-sm">{tt("report.waitSync")}</p>}
  {error&&<p className="txt-danger" role="alert">{workerMessage(locale,error,"error.report")}</p>}
  <button type="submit" className="btn-primary w-full" disabled={busy||queued>0||!photo}>{busy?tt("report.sending"):tt("report.send")}</button>
 </form>;
}
