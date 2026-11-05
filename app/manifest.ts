import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "مغسلة سيارتك اللامعة",
    short_name: "المغسلة",
    description: "إدارة سيارات المغسلة والموازنة اليومية",
    start_url: "/",
    scope: "/",
    lang: "ar",
    dir: "rtl",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/api/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
