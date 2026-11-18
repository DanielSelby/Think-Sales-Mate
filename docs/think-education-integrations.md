# Think Education payment and announcement integrations

## Guardian fee payments

Set the server-only `PAYSTACK_SECRET_KEY` and configure the Paystack webhook to
`/api/restaurant-order/paystack/webhook`. This shared endpoint handles both
Restaurant and Think Education payment references. The Education checkout
callback is generated from `NEXT_PUBLIC_SITE_URL` or `SITE_URL`; use the
production HTTPS origin in production.

The guardian portal displays online payment only for signed-in accounts with a
confirmed email and an active, verified guardian-to-student relationship.
Payment amount, currency, and payer email are derived server-side. Successful
payments are recorded only after Paystack transaction verification.
Before checkout, the school's accounting setup must include an open period for
today, an active student receivable mapping, and an active card payment mapping
for the fee's campus. The card mapping is also used for Paystack settlement.

## Announcement email and SMS

Announcement delivery reuses the configured email and SMS providers in
`.env.example`; no additional provider integration is required. Each recipient
must opt in to email and/or SMS from the Education notifications page or family
portal. Preferences start off. Published announcements queue only opted-in
recipients with an on-file contact. Delivery statuses can be reviewed and
pending or unsuccessful batches continued from the announcement page.

## Database migrations

Review and apply these migrations through the normal database deployment
process before enabling the features:

- `20261118111000_education_google_classroom.sql`
- `20261118112000_education_guardian_paystack.sql`
- `20261118113000_education_announcement_messaging.sql`

They are not applied by this change.
