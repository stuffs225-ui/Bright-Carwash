-- تراجع عن قفل تسجيل الدخول بناءً على طلب المستخدم — رجّع الوصول المفتوح.

drop policy "authenticated read/write car_types" on car_types;
drop policy "authenticated read/write service_types" on service_types;
drop policy "authenticated read/write expense_types" on expense_types;
drop policy "authenticated read/write settings" on settings;
drop policy "authenticated read/write entries" on entries;
drop policy "authenticated read/write expenses" on expenses;

create policy "public read/write car_types" on car_types for all using (true) with check (true);
create policy "public read/write service_types" on service_types for all using (true) with check (true);
create policy "public read/write expense_types" on expense_types for all using (true) with check (true);
create policy "public read/write settings" on settings for all using (true) with check (true);
create policy "public read/write entries" on entries for all using (true) with check (true);
create policy "public read/write expenses" on expenses for all using (true) with check (true);
