-- Audit operator changes to quick prices and review-only addon suggestions.
-- No change to historic customer or finance records.
create trigger carwash_catalog_prices_audit
 after insert or update or delete on public.entry_presets
 for each row execute function private.audit_row();
create trigger carwash_addon_proposals_audit
 after insert or update or delete on public.carwash_addon_proposals
 for each row execute function private.audit_row();
