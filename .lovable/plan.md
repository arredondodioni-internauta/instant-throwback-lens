## Problem

Two things are blocking host signup right now:

1. The email you tested with (`juan.arredondo.moreno@gmail.com`) is already registered. Supabase intentionally does NOT resend a confirmation email in that case — it silently returns success to avoid leaking which emails exist. That's why nothing arrives.
2. Even for brand new emails, the default Lovable Cloud sender has tight rate limits and frequently lands in spam, which makes "create account → confirm via email" unreliable for an MVP.

## Fix

Turn on **auto-confirm email signups** in the backend auth settings. After this:

- New hosts can sign up and are signed in immediately — no email step.
- The existing `signup.tsx` page already handles the "session exists after signup → navigate to `/events`" path, so no UI changes are needed.
- The duplicate-account case will now surface as a normal "User already registered" error from Supabase, which the existing `toast.error(error.message)` will display.

## Steps

1. Call `supabase--configure_auth` with `auto_confirm_email: true` (keeping signup enabled, anonymous users disabled, HIBP password check enabled for safety).
2. Test the flow: sign up with a fresh email → confirm immediate redirect to `/events`.
3. Test the duplicate case: sign up again with the same email → confirm a clear error toast appears.

## Trade-off you accepted

Anyone can sign up with a fake/typo'd email since we no longer verify ownership. That's fine for MVP / closed beta. If you later want branded confirmation emails on your own domain, we can layer Lovable Emails on top without rewriting the signup flow.

No code changes are required — this is a single auth-settings toggle.