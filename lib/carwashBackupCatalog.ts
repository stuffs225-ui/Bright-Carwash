/**
 * Production database backup allowlist. Update this inventory whenever a
 * migration introduces a new public business/finance/security table.
 * Deliberately exclude Supabase auth identities/credentials and storage metadata.
 */
export const CARWASH_BACKUP_TABLES=[
 "accounting_month_report_versions","accounting_months","app_members",
 "audit_events","audit_log","car_types","carwash_addon_proposals",
 "carwash_addons","carwash_cash_movements","carwash_crew_payouts",
 "carwash_day_devices","carwash_day_settlements","carwash_days",
 "carwash_entry_line_items","carwash_entry_readiness","carwash_import_batches",
 "carwash_inventory_items","carwash_inventory_movements",
 "carwash_manager_pin_verifiers","carwash_owner_activation_links",
 "carwash_owner_devices","carwash_photo_cleanup_log","carwash_pin_rate_limits",
 "carwash_readiness_events","carwash_registered_devices",
 "carwash_report_corrections","carwash_shift_devices",
 "carwash_shift_settlements","carwash_shifts","carwash_worker_day_reports",
 "carwash_worker_link_submissions","carwash_worker_links",
 "crew_shift_bonuses","entries","entry_presets","error_log",
 "expense_types","expenses","legacy_import_issues","legacy_source_rows",
 "ready_sms_outbox","service_types","settings","worker_ledger","workers"
] as const;
export type CarwashBackupTable=(typeof CARWASH_BACKUP_TABLES)[number];

export const FINANCIAL_TABLES=[
 "entries","expenses","carwash_days","carwash_day_settlements",
 "carwash_cash_movements","carwash_crew_payouts",
 "worker_ledger","carwash_inventory_items","carwash_inventory_movements",
 "accounting_months","accounting_month_report_versions",
 "carwash_report_corrections","audit_events"
] as const;

export function missingArchiveTables(
 tables:Record<string,unknown>|null|undefined,
 required:readonly string[]=CARWASH_BACKUP_TABLES
):string[]{
 return required.filter(name=>!Array.isArray(tables?.[name]));
}

export function validArchiveCounts(
 tables:Record<string,unknown>|null|undefined,
 counts:Record<string,number>|null|undefined
):boolean{
 if(!tables||!counts)return false;
 return Object.keys(counts).every(name=>
  Number.isInteger(counts[name])&&counts[name]>=0&&
  Array.isArray(tables[name])&&(tables[name] as unknown[]).length===counts[name]
 );
}

/** A v1 archive may be cryptographically valid but lack newly introduced tables. */
export function archiveCoverageStatus(
 tables:Record<string,unknown>|null|undefined,
 counts:Record<string,number>|null|undefined
){
 const missing=missingArchiveTables(tables);
 return {complete:validArchiveCounts(tables,counts)&&missing.length===0,missing};
}
