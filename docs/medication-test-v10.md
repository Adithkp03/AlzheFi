# Medication tracking - isolated test v10

This is engineering test software, not prescription advice, proof of ingestion or clinical monitoring.

## Current limits
- Only the isolated care-test host is targeted. No production merge is part of this change.
- Patient can enter exact prescribed name, dose/route and instructions, daily HH:mm times, named timezone (ambiguous/nonexistent clock-change times rejected,never automatically skipped or duplicated) and a date range up to90days. No PRN, taper, dosage calculation or prescribing.
- Create retries use a stable request key. Edits apply from save onward. Existing dose reports and plan-edit history stay in the server audit record.
- Records are not_confirmed, reported_taken, reported_skipped or cancelled. Corrections retain who/role/time; optimistic versions prevent silent overwrite.
- Caregiver access is server-gated OFF until product settings approval. After enabling, patient must separately share medication details with each current link. Primary can edit/report; secondary read-only. Medication grants are bound to the exact CareLink,so re-linking cannot revive old consent.
- Primary follow-up is also server-gated OFF. The request-driven adapter is implemented but no dedicated scheduler has been deployed. It must not be advertised as automatic closed-app30-minute monitoring.
- Patient notification/voice switches default off and are account-specific. Android notifications and Alarms & reminders permission are required. Spoken audio is a generic English prerecorded clip,never drug names. It is a custom notification sound,not arbitrary TTS that depends on JS timers.
- Reminders are a rolling seven-day queue,subject to the Android50-trigger shared limit (we reserve2 slots). The queue end is shown. Open daily to sync changes and refill. Offline caregiver edits cannot cancel local reminders until sync.
- Notification permission,channel settings,silent/DND,OEM battery controls,force-stop and platform scheduling affect delivery. A queued alarm is not proof of receipt. No medicine should be repeated because of a notification.
- Logout clears only medication reminders and preserves other alert types. Location/battery logic is unchanged.

## Synthetic manual checks,not clinical dosing
1. Keep v9 available until the new APK passes installation and location regression checks. Same package/signing key,new versionCode10.
2. Patient account: open bell tab. Enter a clearly synthetic schedule only; check date/time/timezone and review screen. Do not enter real prescribed details for this engineering test.
3. At a due occurrence,report taken,refresh,then correct to unknown. Check history remains and no duplicate plan appears after a safe retry.
4. Turn notifications on,allow Android permissions,then opt into spoken reminder only in a private place. Schedule a synthetic future occurrence a few minutes ahead. Test foreground,screen-off and offline separately; record actual receipt and sound. No claim of those checks passing is made by source/unit tests.
5. Deny alarm/notification permission: screen should state reminders unavailable rather than claim they are queued. Verify changing to the tone channel removes generic spoken audio.
6. Edit/stop future schedule and sync patient phone; obsolete pending alarms should disappear. When patient phone is offline,it cannot know an edit yet.
7. Log out or switch account: medication reminders must not carry over. Existing location alert switches/radar/synthetic boundary controls should remain intact.
8. Caregiver paths and follow-up require explicit settings approval,patient sharing opt-in and server flags. Revoke access and verify details disappear on refresh; secondary has no edit/report controls. Run the deferred real-GPS two-phone test only as separately arranged.

## Audio provenance
`medication_voice.mp3` is synthesized offline using eSpeak NG1.50,English,140words/min. Spoken text: It is time to check your medication schedule. Open the app and follow your prescribed instructions. If you are unsure whether you took a dose,check with your caregiver.
