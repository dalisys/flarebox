# Mail filters

Filters sort new mail for you. Each account has its own filters.

## Make a filter

1. Open the account's **Settings** page.
2. Go to **Filters**.
3. Select **Add filter**.
4. Fill in one or more conditions:
   - **From contains**
   - **To contains** (To and Cc addresses)
   - **Subject contains**
   - **Body contains**
5. Choose one or more actions:
   - **Move to folder**: Archive, Junk, Trash, or one of your own folders.
   - **Mark as read**
   - **Star**
6. Select **Add filter**. Filters save at once.

## How filters work

- A filter matches when **all** filled conditions match.
- Matching ignores upper and lower case. "invoice" matches "Invoice".
- Filters run from top to bottom. **Only the first filter that matches is used.** Use the up arrow to change the order.
- Filters run only on new mail that is not junk. The junk filter runs first.
- A filter that moves mail to Junk also stops forwarding, AI drafts, and push for that email.
- If the folder of a filter was deleted, the email stays in Inbox.
- If a filter fails, the email stays in Inbox. The email is never lost.
- Use the switch to turn a filter off without deleting it.

## Run a filter on old mail

Select **Run on Inbox** on a filter. The filter runs once on all mail that is in Inbox now. It also runs when the filter is off.

## Storage

Filters are kept in R2 at `config/filters/<address>.json`. They are deleted when you delete the mailbox. A mailbox move does not copy filters.
