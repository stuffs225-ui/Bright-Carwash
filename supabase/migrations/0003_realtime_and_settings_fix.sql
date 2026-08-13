-- تفعيل المزامنة اللحظية (Realtime) للجداول الأساسية
alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table expenses;

-- السماح بتعديل الإعدادات (كان قراءة فقط بالغلط)
create policy "public update settings" on settings for update using (true) with check (true);
