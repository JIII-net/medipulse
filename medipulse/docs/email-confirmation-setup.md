# Email confirmation on sign-up (SMTP)

New 4MED accounts confirm their email before they can log in. Supabase Auth
sends the confirmation email through your own SMTP server.

The app side is already done: the database builds each account when it's
created (`medipulse-email-confirmation.sql`), sign-up shows "Check your email"
with a resend button, and logging in before confirming explains what to do.
These steps are in the Supabase dashboard for project **medipulse**
(`wrcreftimirydwffwzgo`). Do them in this order.

## 1. SMTP server

Authentication → **Emails** → **SMTP Settings** → turn on **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | e.g. `no-reply@4-keys.net` (an address your SMTP account may send from) |
| Sender name | `4MED` |
| Host | your provider's SMTP host |
| Port | `465` (SSL) or `587` (STARTTLS) |
| Username / Password | your SMTP login (Gmail and Google Workspace need an *app password*) |

Then raise **Rate Limits → emails sent per hour** from the default to what you
expect (e.g. 100).

Common hosts: Google Workspace / Gmail `smtp.gmail.com`, Microsoft 365
`smtp.office365.com`, Zoho `smtp.zoho.com`, Hostinger `smtp.hostinger.com`,
Resend `smtp.resend.com` (username `resend`, password = API key),
Brevo `smtp-relay.brevo.com`.

For mail to land in the inbox, the sender domain should have SPF and DKIM
records from your provider.

## 2. Where the link sends people

Authentication → **URL Configuration**:

- **Site URL**: `https://4med.4-keys.net`
- **Redirect URLs**: add `https://4med.4-keys.net/**`
  (and `http://localhost:5173/**` if you test locally)

## 3. The email itself

Authentication → **Emails** → **Templates** → **Confirm signup**:

- Subject: `Confirm your 4MED account`
- Body: paste `supabase/templates/confirm-signup.html`

## 4. Turn it on

Authentication → **Sign In / Providers** → **Email** → turn on **Confirm email**.

Test it: sign up with a fresh email address. You should see "Check your
email", get the 4MED email, and land back in 4MED signed in after tapping the
button. Accounts made before this were already confirmed and keep working.
