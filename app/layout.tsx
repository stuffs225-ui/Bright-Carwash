import type { Metadata,Viewport } from "next";
import "./globals.css";

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover"};

export const metadata: Metadata = {
  title: "مغسلة سيارتك اللامعة",
  description: "نظام إدارة مغسلة سيارتك اللامعة",
  manifest: "/manifest.webmanifest",
  appleWebApp:{capable:true,statusBarStyle:"default",title:"المغسلة"},
  icons: {icon:"/api/pwa-icon/192",apple:"/api/pwa-icon/192"},
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="theme-color" content="#1d4ed8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* يطبّق المظهر المحفوظ قبل أول رسم، وإلا يومض الطيف الفاتح قبل الداكن */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem("carwash_theme_v1");if(t==="light"||t==="dark"){d.setAttribute("data-theme",t)}/* Manager uses standard controls; worker link toggles touch-mode itself. */
if(/^\\/w\\/[a-f0-9]{64}(?:\\/|$)/i.test(location.pathname)){
 d.setAttribute("data-worker-lang-pending","1");
 var v=localStorage.getItem("bright_carwash_worker_lang_v1");
 if(v!=="ha-NG"&&v!=="en"&&v!=="ar"){
  var m=document.cookie.match(/(?:^|; )carwash_worker_lang=(ha-NG|en|ar)(?:;|$)/);
  v=m?m[1]:"ha-NG";
 }
 d.lang=v;d.dir=v==="ar"?"rtl":"ltr";
}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
