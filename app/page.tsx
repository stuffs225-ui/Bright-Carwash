export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", textAlign: "center" }}>
      <h1>مغسلة سيارتك اللامعة</h1>
      <p>الموقع قيد الإنشاء</p>
      <p>
        تحقق من حالة الاتصال بقاعدة البيانات:{" "}
        <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
