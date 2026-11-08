# The-COW

The rebuilt Coach's Office website.

## Coach's Thoughts file uploads

The upload library uses Supabase Storage. Shared files are publicly readable;
uploads require signing in with an authorized Supabase email/password account.
The bucket accepts any file type up to 20 MB.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-setup.sql` to create or update the
   public bucket and its read/upload policies.
3. In Supabase Authentication settings, disable public sign-ups and create
   email/password accounts for the people authorized to upload.
4. Copy the project's URL and its public publishable (or legacy `anon`) key
   into `supabase-config.js`. Never put a `service_role` key in this website.
5. Publish the site. Authorized uploaders can sign in to add files up to 20 MB;
   visitors can download shared files from the library.

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
