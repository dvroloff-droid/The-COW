# The-COW

The rebuilt Coach's Office website.

## Coach's Thoughts file uploads

The Coach's Thoughts library uses Supabase Storage. Shared files and published
stories are publicly readable; uploads and story publishing require signing in
with an authorized Supabase email/password account. The bucket accepts any file
type up to 20 MB.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-setup.sql` to create or update the
   public bucket and its read/upload policies.
3. In Supabase Authentication settings, disable public sign-ups and create
   email/password accounts for the people authorized to upload.
4. Copy the project's URL and its public publishable (or legacy `anon`) key
   into `supabase-config.js`. Never put a `service_role` key in this website.
5. Publish the site. Authorized uploaders can sign in to add files or publish
   newspaper columns with formatted text and inline pictures. Each picture may
   be up to 20 MB. Published columns open in a multi-column newspaper layout,
   with more room reserved for the article than either side column; older
   plain-text stories remain readable in the library.
   Authorized uploaders can also share `.xlsx`, `.xls`, and `.xlsm`
   workbooks up to 20 MB. Workbooks are stored unchanged, preserving every
   worksheet, and appear as public download links. Visitors can download a
   copy but cannot modify the shared original; only authorized accounts can
   upload files.

## Password recovery

In Supabase Authentication URL Configuration, set the Site URL to
`https://dvroloff-droid.github.io/The-COW/` and add the published page URLs
`https://dvroloff-droid.github.io/The-COW/` and
`https://dvroloff-droid.github.io/The-COW/index.html` to Redirect URLs. Add
other deployment URLs only if they are trusted. If using a custom reset email
template, ensure its link uses `{{ .ConfirmationURL }}` so Supabase verifies the
reset before redirecting back to the site.

On the published site, enter the authorized account's email and select
**Send password reset link**. Open the latest link in the email and enter the
new password on the site. Links expire and can be used only once; request a
new one if needed.
