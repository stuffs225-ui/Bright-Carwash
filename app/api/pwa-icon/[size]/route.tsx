import { ImageResponse } from "next/og";

export const runtime = "edge";
export async function GET(_request: Request,{params}:{params:{size:string}}){
  const size = Number(params.size);
  if(size!==192&&size!==512)return new Response("Not Found",{status:404});
  return new ImageResponse(
    <div style={{
      display:"flex",width:"100%",height:"100%",
      background:"#1d4ed8",borderRadius:size*.17,
      alignItems:"center",justifyContent:"center",
      color:"white",fontWeight:900,fontSize:size*.58,
      fontFamily:"sans-serif",letterSpacing:"-0.05em",
    }}>W</div>,
    {width:size,height:size}
  );
}
