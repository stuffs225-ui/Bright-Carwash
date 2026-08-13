insert into settings (key, value) values
  ('backup_email', '"Aburaykah@gmail.com"'),
  ('backup_interval_days', '10'),
  ('backup_last_sent_at', 'null')
on conflict (key) do nothing;
