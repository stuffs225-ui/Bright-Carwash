import type { Metadata } from "next";
import "./globals.css";

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
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem("carwash_theme_v1");if(t==="light"||t==="dark"){d.setAttribute("data-theme",t)}if(localStorage.getItem("carwash_mode_v1")!=="owner"){d.classList.add("touch-mode")}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
