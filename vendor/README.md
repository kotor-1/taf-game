# Supabase JavaScript SDK

`supabase-js-2.117.3.js` is the unmodified browser bundle from the official
`@supabase/supabase-js` npm package, version **2.117.3**. It is served locally
with the game so login does not require a third-party script CDN.

- Package: https://www.npmjs.com/package/@supabase/supabase-js/v/2.117.3
- Source: https://github.com/supabase/supabase-js
- Archive: https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.117.3.tgz
- Extracted file: `package/dist/umd/supabase.js`
- Archive integrity verified before extraction:
  `sha512-K+f8PimXDunPWQ63CKRXaF5pbVPJxmfw5ryAnh0s9S9PkwcuqBjiSpIaqpF7KLDljeYwXIL85ST8QxaO0+XuvA==`
- License: [SUPABASE-LICENSE.txt](SUPABASE-LICENSE.txt)

The SDK owns session storage, automatic token refresh and cross-tab auth events.
The application verifies the SDK's current token with `auth.getUser(token)` and
uses that same frozen token for a save request, preventing an account change in
another tab from redirecting an in-flight save to a different account.
