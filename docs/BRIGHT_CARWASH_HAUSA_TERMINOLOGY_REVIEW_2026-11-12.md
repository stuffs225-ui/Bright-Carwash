# Bright Carwash V2 — Hausa (ha-NG) operational terminology review
Date: 2026-11-12 · Scope: **worker-link UI only**.

## Locale and data governance
- **Hausa (Boko Latin), ha-NG, LTR** is the first-visit default. English is LTR, Arabic is RTL.
- All numeric amounts use Latin **0–9**, currency **SAR**, and raw operations remain in the database's established codes and catalog.
- The manager view is always Arabic. WhatsApp customer messages retain their configured customer language.
- Shared worker links never persist a language setting server-side; preference is localStorage with a path-limited cookie fallback.
- Dictionary source: `public/locales/{ha-NG,en,ar}.json`; online and offline worker UI share the exact keys.

## Operational terminology for a native Hausa-speaking Nigerian worker to verify

| Work concept | Current Hausa screen copy | Native-review question |
| --- | --- | --- |
| Register car | **Rijistar mota** | Prefer *Yi rajistar mota* as an action verb? |
| Car wash | **Wankin mota** | Is the everyday business term clear? |
| Small / large car / truck | **Ƙaramar mota / Babbar mota / Babbar motar kaya** | Are size labels intuitive for local fleet types? |
| Full wash | **Cikakken wanki** | Does it imply inside and outside? |
| Exterior wash | **Wankin waje** | Is it unambiguously exterior-only? |
| High-pressure / piston wash | **Wankin matsin lamba** | Does the worker call this *piston* instead? |
| Cash | **Tsabar kuɗi** | Common cash wording among the staff? |
| POS / bank card | **Kati / POS** | Use this label or plain **POS**? |
| Mixed cash/POS | **Biya a haɗe** | Does this clearly mean splitting one sale? |
| Cash handoff / closing the day | **Rahoton ƙarshen rana** | Confirm settlement-vs-handover phrasing |
| Ready for collection | **Ta shirya a karɓa** | Confirm readiness/delivery terminology |
| Delivered | **An miƙa mota** | Confirm status is not interpreted as dispatch |
| Notify via WhatsApp | **Tura saƙon an gama** | Does it imply opening chat, not guaranteed sending? |
| Workers' team share | **Haƙƙin ma'aikata** | Should explicitly say this is the team allocation, not each individual's wage |
| Unapproved vs awaiting approval | **Ba a amince ba / Ana jiran amincewa** | Are the two statuses visibly distinct? |

These translations are **working UI proposals, not native-speaker certified**. Ask the actual Hausa-speaking employee to review the above terms on his phone, especially POS, pressure wash, wage allocation and end-of-day handoff. Adjust only the JSON display strings after review, never the stored source values.

## Reference language resources
- HausaNLP's Center for Nigerian Languages dictionary: https://kamusunhausa.hausanlp.org/
- HausaDictionary reference for *mota / motoci*: https://www.hausadictionary.com/motocin
- Hausa-language business reporting uses **na'urar POS**: https://hausa.legit.ng/news/1736037-ncc-ta-fara-shirin-hana-waua-wayoyi-amfani-da-sabis-a-najeriya/

## Tests / acceptance
The feature-specific browser tests cover first visit, per-browser persisted preference, RTL switch, unsaved input retention, mixed-payment numeric payload, WhatsApp language independence, and an AES-GCM offline queue. These are synthetic fixtures; the native Hausa wording remains a separate human review item.
