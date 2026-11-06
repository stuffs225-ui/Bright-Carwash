-- Post-0023 synthetic tests, zero customer data and NO external provider sends.
-- Carwash legacy historic car with missing money remains in real entries.
reset role;
insert into public.entries(car_type,service_type,cash_paid,card_paid,
 legacy_ref,legacy_recorded_total,legacy_import_flag,occurred_at)
values('سيارة صغيرة','غسيل كامل',0,0,
 'Main_Data:999001',25,'missing_payment','2025-08-01 12:00:00+03');
do $qa_zero_legacy$
declare c integer;
begin
 select count(*) into c from public.entries where legacy_ref='Main_Data:999001'
 and gross=0 and legacy_recorded_total=25 and legacy_import_flag='missing_payment';
 if c<>1 then raise exception 'Lossless imported unknown-payment row missing';end if;
end
$qa_zero_legacy$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
-- A new entry on TODAY with WhatsApp-only consent.
insert into public.entries(car_type,service_type,cash_paid,card_paid,
 device_id,client_mutation_id,occurred_at,customer_phone,sms_consent,whatsapp_consent)
values('سيارة صغيرة','غسيل كامل',25,0,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'carwash-whatsapp-live-test',now(),'+966500000009',false,true);
do $qa_whatsapp_consent$
declare first_result text;second_result text;
begin
 first_result:=public.request_ready_notice(null,'carwash-whatsapp-live-test');
 second_result:=public.request_ready_notice(null,'carwash-whatsapp-live-test');
 if first_result<>'pending_provider' or second_result<>'already_ready'
 then raise exception 'WhatsApp ready must be idempotent, got %, %',first_result,second_result;end if;
end
$qa_whatsapp_consent$;
insert into public.entries(car_type,service_type,cash_paid,card_paid,
 device_id,client_mutation_id,occurred_at,customer_phone,sms_consent,whatsapp_consent)
values('سيارة صغيرة','غسيل كامل',25,0,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'carwash-whatsapp-no-consent',now(),'+966500000008',true,false);
do $qa_no_whatsapp_consent$
declare result text;
begin
 result:=public.request_ready_notice(null,'carwash-whatsapp-no-consent');
 if result<>'ready_no_whatsapp' then raise exception 'WhatsApp sent without explicit opt in';end if;
end
$qa_no_whatsapp_consent$;

-- A worker cannot call privileged backend-only dispatch helpers.
do $qa_worker_cannot_dispatch$
declare blocked boolean:=false;
begin
 begin
  perform public.carwash_claim_whatsapp_ready(1);
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Worker gained outbox dispatch authority';end if;
end
$qa_worker_cannot_dispatch$;

reset role;
do $qa_exactly_one_consent$
declare n integer;
begin
 select count(*) into n from public.ready_sms_outbox where destination_phone='+966500000009';
 if n<>1 then raise exception 'Ready WhatsApp should have exactly one outbox item';end if;
 select count(*) into n from public.ready_sms_outbox where destination_phone='+966500000008';
 if n<>0 then raise exception 'Previous SMS opt-in must not automatically authorize WhatsApp';end if;
end
$qa_exactly_one_consent$;

set role service_role;
do $qa_pin_limit$
declare accepted boolean; i integer;
begin
 for i in 1..5 loop
  accepted:=public.carwash_pin_consume_attempt(repeat('d',64),5,30);
  if not accepted then raise exception 'Unexpected lock before five attempts';end if;
 end loop;
 accepted:=public.carwash_pin_consume_attempt(repeat('d',64),5,30);
 if accepted then raise exception 'PIN brute-force lockout is missing';end if;
 if not public.carwash_pin_clear_attempts(repeat('d',64))
 then raise exception 'Could not reset after successful login';end if;
end
$qa_pin_limit$;
select * from public.carwash_claim_whatsapp_ready(50);
do $qa_sender_claim$
declare n integer; the_id uuid;ok boolean;
begin
 select count(*),(array_agg(id))[1] into n,the_id from public.ready_sms_outbox
 where destination_phone='+966500000009' and status='queued' and attempt_count=1;
 if n<>1 then raise exception 'WhatsApp outbox not reserved exactly once';end if;
 ok:=public.carwash_complete_whatsapp_ready(the_id,'sent','wamid.synthetic.carwash',null);
 if not ok then raise exception 'Cannot record Meta acceptance';end if;
 select count(*) into n from public.ready_sms_outbox
 where id=the_id and status='sent' and provider_message_id='wamid.synthetic.carwash';
 if n<>1 then raise exception 'Meta accepted message not recorded';end if;
end
$qa_sender_claim$;
reset role;
select 'CARWASH PIN LOCKOUT + LOSSLESS LEGACY + WHATSAPP CONSENT E2E PASSED' as result;
