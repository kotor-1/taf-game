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

# LZ-string save compression

`lz-string-1.5.0.js` comes from the official **lz-string 1.5.0** npm archive:

- Source: https://github.com/pieroxy/lz-string
- Archive: https://registry.npmjs.org/lz-string/-/lz-string-1.5.0.tgz
- Extracted file: `package/libs/lz-string.js`
- Archive integrity verified before extraction:
  `sha512-h5bgJWpxJNswbU7qCrV0tIKQCaS3blPDrqKWx+QxzuzL1zGUzij9XCWLrSLsJPu5t+eWA/ycetzYAO5IOMcWAQ==`
- License supplied in that package: [LZ-STRING-LICENSE.txt](LZ-STRING-LICENSE.txt)

The upstream source's historical header still says version 1.4.5 and WTFPL;
the published 1.5.0 archive includes the MIT license reproduced here.
Original notices have been retained.

The only local modification is a decompression safety bound:
`decompressFromUTF16(compressed, maxOutputLength)` passes an optional limit to
`_decompress`, which counts emitted characters and throws before exceeding it.
The compression format and normal output are unchanged. Calls without a limit
retain the original behavior.

`persistence.js` stores large saves as `TAF-LZ1:<length>:<checksum>:<UTF16 data>`.
It validates the length (at most 20 Mi characters), stops expansion beyond that
length, verifies the checksum, then validates the decoded game state. Small
and legacy JSON saves remain readable. Exported files and Supabase payloads
remain ordinary JSON; compression affects browser storage only.
