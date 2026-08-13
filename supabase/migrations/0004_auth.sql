-- قفل الوصول: بعد هذا التحديث لازم تسجيل دخول (أي حساب موظف) للقراءة أو الكتابة.
-- كانت السياسات القديمة مفتوحة بالكامل لمفتاح anon (بدون تسجيل دخول) كخطوة مؤقتة
-- للانطلاق السريع، وهذا يستبدلها.

drop policy "public read/write car_types" on car_types;
drop policy "public read/write service_types" on service_types;
drop policy "public read/write expense_types" on expense_types;
drop policy "public read settings" on settings;
drop policy "public update settings" on settings;
drop policy "public read/write entries" on entries;
drop policy "public read/write expenses" on expenses;

create policy "authenticated read/write car_types" on car_types for all to authenticated using (true) with check (true);
create policy "authenticated read/write service_types" on service_types for all to authenticated using (true) with check (true);
create policy "authenticated read/write expense_types" on expense_types for all to authenticated using (true) with check (true);
create policy "authenticated read/write settings" on settings for all to authenticated using (true) with check (true);
create policy "authenticated read/write entries" on entries for all to authenticated using (true) with check (true);
create policy "authenticated read/write expenses" on expenses for all to authenticated using (true) with check (true);
