/**
 * Client-side parser for a Supabase Auth email verification URL.
 *
 * The hosting project can still have an obsolete localhost Site URL. The
 * unclicked email link contains a one-time token hash, which can be verified
 * by the Supabase SDK without following the incorrect redirect. No token is
 * ever sent to our server, logged, or persisted in localStorage.
 */
export type CarwashRecoveryLink =
 | {kind:"otp";token_hash:string;type:"magiclink"|"recovery"|"email"}
 | {kind:"session";access_token:string;refresh_token:string};

export function parseCarwashRecoveryLink(raw:string,supabaseUrl:string):CarwashRecoveryLink{
 let url:URL;
 try {url=new URL(raw.trim());} catch {throw Error("الصق رابط التحقق الكامل من رسالة الإيميل، وليس عنوان localhost فقط.");}
 const expected=new URL(supabaseUrl);
 if(url.origin===expected.origin && url.pathname==="/auth/v1/verify"){
  const token_hash=url.searchParams.get("token_hash")||url.searchParams.get("token")||"";
  const kind=url.searchParams.get("type");
  if(!/^[a-f0-9]{64}$/i.test(token_hash))
   throw Error("الرابط لا يحتوي على رمز تحقق صالح. انسخ الرابط كاملًا من رسالة جديدة قبل فتحه.");
  if(kind!=="magiclink"&&kind!=="email"&&kind!=="recovery")
   throw Error("نوع رابط التحقق غير مدعوم.");
  return {kind:"otp",token_hash,type:kind};
 }
 // The originally configured localhost redirect can contain a freshly issued
 // session after Supabase has already consumed the one-time verify URL.
 // Only import the session in the user's browser, never expose its tokens.
 if(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)){
  const hash=new URLSearchParams(url.hash.replace(/^#/,""));
  const access_token=hash.get("access_token")||"";
  const refresh_token=hash.get("refresh_token")||"";
  if(access_token&&refresh_token)return {kind:"session",access_token,refresh_token};
  throw Error("هذا عنوان localhost فقط وليس رابط تحقق صالحًا. إذا فتحت الرسالة سابقًا، يجب استخدام رابط جديد لم يُفتح.");
 }
 throw Error("الصق رابط التحقق الأصلي من Supabase فقط، وليس عنوان موقع آخر.");
}
