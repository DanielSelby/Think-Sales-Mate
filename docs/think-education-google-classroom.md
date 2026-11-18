# Think Education Google Classroom integration

The integration is organization-specific and uses Google OAuth's authorization-code flow. Configure an OAuth client in Google Cloud, enable the Google Classroom API, and add this exact authorized redirect URI:

`https://<your-app-host>/api/education/google-classroom/callback`

Set these server-only environment variables:

- `GOOGLE_EDUCATION_CLIENT_ID` — OAuth client ID.
- `GOOGLE_EDUCATION_CLIENT_SECRET` — OAuth client secret.
- `GOOGLE_EDUCATION_REDIRECT_URI` — the callback URI registered above.
- `GOOGLE_EDUCATION_TOKEN_ENCRYPTION_KEY` — base64 encoding of exactly 32 random bytes, used for AES-256-GCM refresh-token encryption.

Generate a key locally with Node.js (keep the output in a secret manager; do not commit it):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

The OAuth request asks only for `classroom.courses.readonly`, `classroom.rosters.readonly`, and `classroom.profile.emails` (the latter is needed to match roster members against existing Education student email addresses). Access tokens are short-lived in-memory values only; only the AES-256-GCM encrypted refresh token is stored. Changing the encryption key makes existing connections unreadable, so disconnect/reconnect each organization after key rotation.

Apply the dedicated migration `20261118111000_education_google_classroom.sql` through the normal reviewed database migration process before enabling this route. The migration is intentionally not applied by this change.
