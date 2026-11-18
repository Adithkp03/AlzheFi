# Tracking reliability test, November18,2026

Test-only. A successful short test is not proof of uninterrupted24/7 coverage.
Use consenting test accounts and a stationary safe setting. Do not deliberately cross a boundary.
Do not enter real medication doses for this test.

## Preconditions
- Record APK version,phone model,Android version,battery percentage and battery-saver mode on both phones.
- Patient sharing explicitly on for the test caregiver;the caregiver has an active link.
- Patient grants precise location and notifications,Location toggle on,app open while starting the location foreground service.
- Caregiver allows notifications. Record notification channel/DND settings.
- Isolated API health verified. Pending server changes must be activated before testing their alerts.
- Record server received-fix time separately from device recorded-fix time. Do not change device clocks.

## Record per stage
Patient last GPS callback age,device fix timestamp/accuracy,last successful upload age,watch/upload errors;caregiver live/stale/unknown status,fix age/accuracy;server observation time;actual alert receipt time if applicable. No coordinate screenshots in shared reports.

## Stages
1. Screen on,stationary,3minutes. Establish initial fresh fixes/uploads.
2. Patient screen off10minutes,caregiver app open. Record whether server fixes continue.
3. Patient opens another app10minutes,then returns. Check service survives and latest data is genuine.
4. Patient internet off for3minutes while GPS remains on. Caregiver stays online. Expect stale/unavailable,not a false boundary crossing. If enabled,the2minute no-fresh-location episode should be detected by the next server sweep,not necessarily received at exactly2minutes.
5. Restore patient network. Record first fresh fix/server receipt and recovery latency. No historical replay should look live.
6. Patient toggles Location off,then restores. Record watch-error status and whether resuming requires opening the app. Do not claim automatic recovery without observing it.
7. Close/reopen patient app normally,then separately remove app from recents. These are different from Android Force stop. Record each outcome.
8. Separately test Android Active apps Stop or Force stop only with participant agreement. Do not expect or work around intentional OS Stop. Reopen explicitly and verify consent before restarting.
9. Separately reboot phone only with agreement. Record whether the app truthfully says tracking needs restart rather than assuming continuous coverage.
10. Revoke patient sharing while caregiver is watching. No further coordinates,health alerts or boundary repeats to that caregiver. Re-enable only explicitly;new consent must not replay old episodes.
11. Log out/switch account. No previous-owner GPS callbacks/uploads/alerts may be attributed to the new account.

## Not yet implemented/verified at checklist creation
Native-owned durable location/upload pipeline,process-death/boot recovery,server unavailable-alert endpoint/timer,repeat-alert Stop action and final repeat policies. Existing synthetic diagnostic confirms neither real GPS nor these cases.

## Completion evidence
Keep a short timestamped table per stage. Report observed gaps and recovery,not just 'passed'. Start an extended battery/use-duration trial only after short consent,screen-off,network and account-isolation checks pass. No emergency-monitor or delivery guarantee.
