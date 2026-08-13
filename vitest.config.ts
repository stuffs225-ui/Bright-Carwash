import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // عميل Supabase يُنشأ وقت استيراد الوحدة ويرمي خطأ بدون هذي القيم.
    // قيم وهمية تكفي: الاختبارات تغطي دوال خالصة لا تلمس الشبكة.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
