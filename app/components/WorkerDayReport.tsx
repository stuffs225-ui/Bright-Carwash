"use client";
import {useState,useRef} from "react";
type Props={date:string;token:string;queued:number;onSent:()=>void};
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
export function WorkerDayReport({date,token,queued,onSent}:Props){
 const [cash,setCash]=useState(""),[card,setCard]=useState(""),[terminal,setTerminal]=useState("");
 const [photo,setPhoto]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const locked=useRef(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(locked.current||queued>0||!photo)return;
  if([cash,card,terminal].some(v=>!v.trim()||!Number.isFinite(Number(v))||Number(v)<0)){
   setError("أدخل المبالغ الثلاثة");return;
  }
  locked.current=true;setBusy(true);setError("");
  try{
   const blob=await compress(photo);
   const form=new FormData();form.append("token",token);form.append("date",date);
   form.append("cash",cash);form.append("card",card);form.append("terminal",terminal);
   form.append("photo",blob,"report.jpg");
   const res=await fetch("/api/worker-links/day-report",{method:"POST",body:form,cache:"no-store"});
   const json=await res.json().catch(()=>({}));
   if(!res.ok||!json.ok)throw Error(json.error||"لم يتأكد وصول الموازنة، أعد المحاولة");
   onSent();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الموازنة");}
  finally{locked.current=false;setBusy(false);}
 }
 return <form className="card mt-3 space-y-3" onSubmit={submit}>
  <h3 className="font-bold">موازنة نهاية يوم {date}</h3>
  <p className="txt-muted text-sm">أرسل المبالغ الفعلية وصورة تقرير الجهاز للمدير. سيظل اليوم ظاهرًا إلى أن يعتمده.</p>
  <label className="form-label">الكاش الموجود معك (ر.س)<input type="number" min="0" step=".01" inputMode="decimal" required value={cash} onChange={e=>setCash(e.target.value)}/></label>
  <label className="form-label">مبلغ الشبكة (ر.س)<input type="number" min="0" step=".01" inputMode="decimal" required value={card} onChange={e=>setCard(e.target.value)}/></label>
  <label className="form-label">المبلغ الظاهر في تقرير موازنة جهاز الشبكة (ر.س)<input type="number" min="0" step=".01" inputMode="decimal" required value={terminal} onChange={e=>setTerminal(e.target.value)}/></label>
  <label className="form-label">صوّر تقرير جهاز الشبكة<input type="file" accept="image/*" capture="environment" required onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
  {queued>0&&<p className="txt-warning text-sm">زامن السيارات المحفوظة أولًا قبل إرسال الموازنة.</p>}
  {error&&<p className="txt-danger" role="alert">{error}</p>}
  <button type="submit" className="btn-primary w-full" disabled={busy||queued>0||!photo}>{busy?"جارٍ رفع الموازنة...":"إرسال الموازنة للمدير"}</button>
 </form>;
}
