# Sign-in emails (Supabase Auth templates)

Applied to the live project (`sdtsoppvyogdfamotrvx`) on 14 Nov 2026 through the Management API, together with a
minimum password length of 8. Sender name stays «WIXA». The staging project uses Supabase's built-in mail service,
whose templates can't be changed on the free plan.

Invitees to the dashboard team create their own account (sign-up), so they receive **Confirm signup**, not **Invite user**.
Sign-ups must therefore stay allowed in Supabase; dashboard access is granted only with an invite code.

To edit by hand: Supabase → Authentication → Emails → Templates. Keep the `{{ .… }}` placeholders.

## Invite user

**Subject:** You're invited to the WIXA dashboard

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">You've been invited to join the WIXA website dashboard team. Click the button to accept the invitation and choose your password.</p><p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">Accept invitation</a></p><p style="margin:0;color:#625C70;font-size:13px">If you weren't expecting this invitation, you can ignore this email.</p></div></div></div>
```

## Reset password

**Subject:** Reset your password — WIXA

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">We received a request to reset the password for your WIXA dashboard account. Click the button to choose a new password.</p><p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p style="margin:0;color:#625C70;font-size:13px">If you didn't request this, ignore this email — your password stays the same.</p></div></div></div>
```

## Change email address

**Subject:** Confirm your new email address — WIXA

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">A request was made to change the email address of your WIXA dashboard account from <b>{{ .Email }}</b> to <b>{{ .NewEmail }}</b>. Click the button to confirm the change.</p><p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">Confirm new email</a></p><p style="margin:0;color:#625C70;font-size:13px">If you didn't request this change, don't click the button, and change your password from your account page.</p></div></div></div>
```

## Reauthentication

**Subject:** Your confirmation code — WIXA

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">Use this code to confirm the action in your WIXA dashboard:</p><div style="background:#F3EEFC;border-radius:12px;padding:14px;text-align:center;margin:0 0 16px"><span style="font-size:26px;font-weight:bold;letter-spacing:6px;color:#5B21B6">{{ .Token }}</span></div><p style="margin:0;color:#625C70;font-size:13px">Don't share this code with anyone. If you didn't request it, ignore this email.</p></div></div></div>
```

## Magic link

**Subject:** Your sign-in link — WIXA

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">Click the button to sign in to your WIXA dashboard. The link works once and expires shortly.</p><p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">Sign in</a></p><p style="margin:0;color:#625C70;font-size:13px">If you didn't ask to sign in, ignore this email.</p></div></div></div>
```

## Confirm signup

**Subject:** Confirm your email address — WIXA

```html
<div style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F7;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2"><div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">WIXA</div><div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.7"><p style="margin:0 0 12px">Hello,</p><p style="margin:0 0 12px">Thanks for signing up. Click the button to confirm your email address and activate your account.</p><p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">Confirm email</a></p><p style="margin:0;color:#625C70;font-size:13px">If you didn't create an account, ignore this email.</p></div></div></div>
```
