import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مغسلة سيارتك اللامعة",
  description: "نظام إدارة مغسلة سيارتك اللامعة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
