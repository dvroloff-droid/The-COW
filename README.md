# The-COW

The rebuilt Coach's Office website.

## Coach's Thoughts PDF uploads

The upload library uses Supabase Storage. PDFs are publicly readable; uploads
require signing in with an authorized Supabase email/password account. The
bucket accepts PDF files up to 20 MB.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-setup.sql` to create the public
   bucket and its read/upload policies.
3. In Supabase Authentication settings, disable public sign-ups and create
   email/password accounts for the people authorized to upload.
4. Copy the project's URL and its public publishable (or legacy `anon`) key
   into `supabase-config.js`. Never put a `service_role` key in this website.
5. Publish the site. Authorized uploaders can sign in to add PDFs; visitors
   can open the shared PDFs from the library.
