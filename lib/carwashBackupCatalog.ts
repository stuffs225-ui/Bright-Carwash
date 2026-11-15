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
 "carwash_expense_reviews",
 "carwash_entry_line_items","carwash_entry_readiness","carwash_import_batches",
 "carwash_inventory_items","carwash_inventory_movements",
 "carwash_inventory_recipes",
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
export const PRIVATE_AUDIT_BACKUP_KEY="private_carwash_crew_payout_audit" as const;
export const REQUIRED_ARCHIVE_TABLES=[
 ...CARWASH_BACKUP_TABLES,PRIVATE_AUDIT_BACKUP_KEY
] as const;
/** Exceptions to the usual public.id primary key; covers ALL public tables at baseline. */
export const BACKUP_KEY_EXCEPTIONS:Partial<Record<CarwashBackupTable,readonly string[]>>={
 app_members:["user_id"],carwash_crew_payouts:["business_date"],
 carwash_day_devices:["business_date","device_id"],
 carwash_day_settlements:["business_date"],carwash_days:["business_date"],
 carwash_entry_readiness:["entry_id"],
 carwash_manager_pin_verifiers:["user_id"],
 carwash_owner_activation_links:["token_hash"],
 carwash_owner_devices:["token_hash"],carwash_pin_rate_limits:["key_hash"],
 carwash_registered_devices:["device_id"],
 carwash_worker_day_reports:["business_date"],settings:["key"]
};
export function backupPrimaryKeys(table:CarwashBackupTable):readonly string[]{
 return BACKUP_KEY_EXCEPTIONS[table]||["id"];
}

export const FINANCIAL_TABLES=[
 "entries","expenses","carwash_expense_reviews","carwash_days","carwash_day_settlements",
 "carwash_cash_movements","carwash_crew_payouts",
 "worker_ledger","carwash_inventory_items","carwash_inventory_movements",
 "accounting_months","accounting_month_report_versions",
 "carwash_report_corrections","audit_events"
] as const;

export function missingArchiveTables(
 tables:Record<string,unknown>|null|undefined,
 required:readonly string[]=REQUIRED_ARCHIVE_TABLES
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
