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
