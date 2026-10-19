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
