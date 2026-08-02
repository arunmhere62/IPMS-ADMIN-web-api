# Message Templates — How It Works

A simple explanation of how message templates and messages work in this app.

## What is a "Message Template"?

Think of a template like a fill-in-the-blanks letter. Instead of typing a
rent reminder to every tenant by hand, you write it once:

> Hi {{recipient_name}}, your rent for {{pg_name}} is due on {{today}}.

The `{{...}}` parts are placeholders. When you actually send a message to a
specific tenant, the app automatically fills in their name, their PG name,
today's date, etc.

Templates are stored in the database table `whatsapp_templates`. Each
template has:

- A **name** and **display name** (e.g. "Rent Reminder")
- A **body** (the actual text with placeholders)
- A **channel** it's meant for — `WHATSAPP`, `SMS`, or `EMAIL`
- A **status** — `DRAFT`, `ACTIVE`, or `ARCHIVED` (only `ACTIVE` ones show up by default)
- Which **type of people** it applies to (tenants, leads, contacts, etc.)

## The Two Building Blocks

There are two separate features that work together:

1. **Message Templates** (`src/message-templates`) — a simple library where
   you create, edit, view, and delete templates. Nothing gets sent from here.
2. **Messages** (`src/messages`) — where the actual sending happens. You pick
   a template (or write a custom message), the app fills in the blanks, and
   then delivers it.

## Step-by-Step: What Happens When You Send a Message

Imagine you want to send a rent reminder to a tenant.

**Step 1 — You call the "send" API** with:
- Who to send to (`entity_type: TENANT`, `entity_id: 123`)
- Which channel (`WHATSAPP`)
- Either a `template_id`, or your own custom text

**Step 2 — The app finds the right text.**
If you gave a `template_id`, it loads that template's body. It also double
checks the template's channel matches what you asked for (you can't use a
WhatsApp template to send an SMS).

**Step 3 — The app looks up the person.**
Based on `entity_type` + `entity_id`, it fetches the tenant/contact/lead/user
from the database and builds a list of real values: their name, phone
number, PG name, organization name, etc.

**Step 4 — The app fills in the blanks.**
Every `{{placeholder}}` in the message text gets replaced with the real
value. If a placeholder has no matching value, it's simply left as-is.

**Step 5 — The app sends the message.**
Depending on the channel:
- **WhatsApp** → sends via the official WhatsApp API if configured, otherwise
  generates a clickable "click to chat" link (`wa.me/...`) for manual sending.
- **SMS** → sends via Twilio if configured, otherwise just logs it (no SMS
  provider set up yet).
- **Email** → currently just logs it (email sending isn't fully wired up yet).

**Step 6 — The app saves a record.**
Every message that's actually sent (not previewed) is saved to the
`whatsapp_messages` table — so you have full history of what was sent, to
whom, when, and whether it succeeded.

## "Preview" vs "Send"

- **Preview** (`POST /messages/preview`) — does everything above except the
  actual sending and saving. It just shows you what the final message will
  look like. Useful for a "preview before sending" screen in the UI.
- **Send** (`POST /messages/send`) — does the full flow, including delivery
  and saving to history.

## Create Template Screen — What Each Field Does

When you create a template in the admin UI, you'll see these fields:

- **Name** (e.g. `rent_reminder`) — A unique internal slug for the template.
  Not shown to message recipients. Used by developers to look up a template
  programmatically. Must be unique — no two templates can share the same name.

- **Display Name** (e.g. "Rent Reminder") — A human-friendly label that shows
  up in the template picker when someone is choosing which template to send.
  This is what staff see in the UI.

- **Channel** (WhatsApp / SMS / Email) — Which delivery method this template
  is written for. When you actually send a message, the channel you pick must
  match the template's channel. If you try to send an SMS using a WhatsApp
  template, the API will reject it. This prevents sending a WhatsApp-formatted
  message via SMS where it might not make sense.

- **Body** (the message text) — The actual message content with
  `{{placeholders}}` inside it. This is the template itself — everything else
  is metadata about the template. At send time, each `{{placeholder}}` gets
  replaced with real data about the recipient.

- **Recipient Types** (Tenant / Employee / CRM Contact / CRM Lead / User) —
  Tags that control who this template is meant for. It's a filter: when
  someone is composing a message to a Tenant, only templates tagged "Tenant"
  show up in the picker. This prevents accidentally using a lead-follow-up
  template for a tenant. You can check multiple types if the template works
  for more than one kind of recipient.
  > Note: "Employee" is listed as an option but the send flow doesn't
  > currently support sending to employees — only Tenant, Contact, Lead,
  > and User are wired up. This will be addressed in a future update.

- **Status** (Draft / Active / Archived) — Controls whether the template is
  available for use. Only `ACTIVE` templates appear when listing templates.
  Set to `DRAFT` while you're still writing, then switch to `ACTIVE` when
  ready. `ARCHIVED` hides old templates without deleting them.

## What Placeholders Are Available?

| Placeholder | Meaning |
|---|---|
| `{{recipient_name}}` | Name of the person receiving the message |
| `{{recipient_phone}}` | Their phone number |
| `{{recipient_email}}` | Their email |
| `{{pg_name}}` | The PG/property name (for tenants & contacts) |
| `{{pg_address}}` | The PG/property address |
| `{{organization_name}}` | The organization/company name |
| `{{sender_name}}` | Name of the staff member sending the message |
| `{{today}}` | Today's date |
| `{{playstore_link}}` / `{{appstore_link}}` | App download links |
| `{{website_url}}` | Company website |
| `{{support_phone}}` / `{{support_email}}` | Support contact info |

You can also pass your own custom placeholders (`manual_variables`) when
sending, e.g. `{{custom_note}}`.

## Where Things Live in the Code

| What | File |
|---|---|
| Template CRUD API | `src/message-templates/message-templates.controller.ts` |
| Template CRUD logic | `src/message-templates/message-templates.service.ts` |
| Send/Preview API | `src/messages/messages.controller.ts` |
| Send/Preview logic | `src/messages/messages.service.ts` |
| Fills in the placeholders | `src/messages/variable-resolver.service.ts` |
| Actually delivers the message | `src/messages/channel-adapters/` (one file per channel) |

## A Note on Naming (for developers)

The database tables are named `whatsapp_templates` and `whatsapp_messages`
(a legacy name from when only WhatsApp was supported), but they're now used
for all channels — WhatsApp, SMS, and Email. So don't be confused by the
"whatsapp" prefix; it just means "message template" / "message" in general.
