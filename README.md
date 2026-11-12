# The-COW

The rebuilt Coach's Office website.

## Coaching lessons checkout

The coaching lessons page offers a $60 single 60-minute youth baseball lesson
and a $200 package of four 60-minute lessons. Film review is included in the
lessons. Customers are asked to confirm availability before purchasing and
email the coach after payment to arrange lesson times; the site does not
automatically schedule or track lessons.

Online checkout is unavailable until both products are set up in Stripe:

1. In the Stripe Dashboard, create one-time USD products for the single lesson
   ($50) and the four-lesson package ($175), and create a live Payment Link for
   each. Use the same descriptions and prices shown on the site and keep
   adjustable quantity disabled. Configure your receipts, refund policy, and
   any applicable taxes in Stripe.
2. Put the corresponding public `https://buy.stripe.com/...` links into
   `coaching-checkout-config.js` as `single` and `package`. Do not add Stripe
   API keys or other secrets to the website. Each button appears only when its
   link is configured.
3. Publish the changed files and check both links, their product names and
   totals on the live site. Use Stripe's test mode and test links separately to
   verify checkout before switching to live links; test links do not take real
   payments. Stripe's payment confirmation and receipt settings are managed in
   the Stripe Dashboard.

## Coach's Thoughts file uploads

The Coach's Thoughts library uses Supabase Storage. Shared files and published
stories are publicly readable; uploads and story publishing require signing in
with an authorized Supabase email/password account. The bucket accepts any file
type up to 20 MB.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-setup.sql` to create or update the
   public bucket and its read/upload policies. The script also allows
   authorized accounts to update published story files, so rerun it to enable
   the article editor on an existing project.
3. In Supabase Authentication settings, disable public sign-ups and create
   email/password accounts for the people authorized to upload.
4. Copy the project's URL and its public publishable (or legacy `anon`) key
   into `supabase-config.js`. Never put a `service_role` key in this website.
5. Publish the site. Authorized uploaders can sign in to add files, edit
   published stories (including older plain-text stories), and publish
   newspaper columns with formatted text and inline pictures. Each picture may
   be up to 20 MB. Saving waits for picture uploads and confirms that the
   published copy matches the draft; if verification fails, the draft remains
   in the editor. Published columns open in a multi-column newspaper layout,
   with more room reserved for the article than either side column; older
   plain-text stories remain readable in the library.
   Authorized uploaders can also share `.xlsx`, `.xls`, and `.xlsm`
   workbooks up to 20 MB. Workbooks are stored unchanged, preserving every
   worksheet, and appear as public download links under The GFFL section.
   Visitors can download a copy but cannot modify the shared original; only
   authorized accounts can upload files.

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
