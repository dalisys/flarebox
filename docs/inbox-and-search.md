# Inbox and search

## Combined inbox

The folder tree has **All accounts** at the top and one section per address.

- Folders: Inbox, Sent, Drafts, Archive, Deleted, Junk, and Activity.
- **Activity** shows messages from every folder.
- The list loads 50 messages per account. **Load older messages** loads more.
- The list refreshes every 30 seconds.
- A selected message opens in its own account's reading pane.

## Search

- Press Enter to search.
- Search covers the full history of every account in the selected folder.
- Choose **All folders** to search everywhere.
- Sort results by date, sender, or subject.
- You can bookmark search URLs.
- Each account's search bar has the same filters.

### Filters panel

Open **Filters** to pick sender, recipients (including Cc/Bcc), subject, folder, dates, read status, stars, attachments, and attachment filename.

Dates use UTC. The start and end days are included. All filters must match.

### Operators

| Operator | Example |
| --- | --- |
| `from:` | `from:alice` |
| `to:` | `to:team@example.com` |
| `subject:` | `subject:"monthly report"` |
| `in:` | `in:inbox`, `in:activity` (all folders) |
| `is:` | `is:unread`, `is:unstarred` |
| `has:` | `has:attachment`, `has:noattachment` |
| `filename:` | `filename:pdf` |
| `after:` / `before:` | `after:2026-01-01 before:2026-01-31` |

## Bulk actions

Select messages to archive, delete, or mark read or unread. In Junk, use **Empty Junk** to clear it.

## Snooze

Snooze hides a conversation until a time you choose. Open the email and tap the clock button in the toolbar. Pick **Later today** (18:00), **Tomorrow** (08:00), **This weekend** (Saturday 08:00), **Next week** (Monday 08:00), or tap **Pick date & time** for a calendar and a time list in 15-minute steps. On a phone the choices open as a sheet at the bottom of the screen. You can also select many conversations and tap **Snooze** in the selection bar.

Snoozed mail moves to the **Snoozed** folder. Each row shows when it comes back. At that time it returns to the Inbox as unread, at the top of the list. If push notifications are on, you also get a notification. To bring mail back early, open it in Snoozed and tap the **Unsnooze** button.

Times use your device time zone. The server stores them in UTC and wakes the mail with a Durable Object alarm, so the browser does not need to be open. Mail in Sent, Drafts, Deleted, and Junk cannot be snoozed.

## Send later

Send later sends a message at a time you choose. In the compose window, tap the calendar button next to **Send**. Pick **Tomorrow morning** (08:00), **Tomorrow afternoon** (13:00), **Monday morning** (08:00), or pick a date and time.

The message waits in the **Scheduled** folder. Each row shows when it will be sent. Open it to use **Send now**, or **Cancel send** to move it back to Drafts, where you can edit it.

At the send time, Flarebox sends the message the same way as the **Send** button. The copy goes to Sent and replies stay in their conversation. The browser does not need to be open. If a send fails, the row shows **Failed** and the reason. Flarebox tries 3 times in total (5 and 10 minutes apart) and then stops. Use **Send now** to try again.

## Mobile app

- Install Flarebox from your browser as an app (PWA).
- Swipe left or right in a message to open the next or previous one.
- Use the theme button for light or dark mode.

## Push notifications

1. Open **Settings**.
2. Select the bell button to turn notifications on for this device.

- You get a push for each new non-spam email.
- Push keys are made and stored in R2 for you. No setup is needed.
- Pushes go only to known browser push services.
