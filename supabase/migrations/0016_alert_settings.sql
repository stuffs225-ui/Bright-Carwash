-- Legacy Google Apps Script alert configuration, now role protected.
insert into public.settings(key,value) values
 ('alert_max_monthly_expenses','0'),
 ('alert_max_daily_income','0'),
 ('alert_max_monthly_income','0'),
 ('alert_shift_car_target','0'),
 ('alert_max_daily_cars','0')
on conflict (key) do nothing;

drop policy if exists scoped_settings_read on public.settings;
create policy scoped_settings_read on public.settings for select to authenticated
using (
 private.current_app_role() = 'owner'
 or (
  private.current_app_role() = 'manager' and key in (
   'shift_car_threshold','worker_bonus_rate','daily_expense_target','shift_start_hour',
   'shift_end_hour','alert_max_monthly_expenses','alert_max_daily_income',
   'alert_max_monthly_income','alert_shift_car_target','alert_max_daily_cars'
  )
 )
 or (
  private.current_app_role() = 'worker' and key in (
   'shift_car_threshold','worker_bonus_rate','daily_expense_target','shift_start_hour',
   'shift_end_hour','alert_shift_car_target','alert_max_daily_cars'
  )
 )
);
