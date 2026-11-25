# The-COW

The rebuilt Coach's Office website.

## Coaching lessons checkout

The coaching lessons page offers a $60 single 60-minute youth baseball lesson
and a $200 package of four 60-minute lessons. Film review is included in the
lessons. Customers are asked to confirm availability before purchasing and
email the coach after payment to arrange lesson times; the site does not
automatically schedule or track lessons.

The site accepts Stripe Payment Links. Follow
[STRIPE_INTEGRATION_TODO.md](STRIPE_INTEGRATION_TODO.md) for Stripe setup,
test-mode guidance, and the remaining link values. Do not add Stripe API keys
or other secrets to the website.

## The Weekly Paycheck

Visit `weekly-paycheck.html#coach-login` and sign in with the same authorized
account used for Coach's Thoughts. Give the post a headline, copy cells from
a spreadsheet, paste them into the form, and publish. The first row becomes
the table headings. Published tables are public and can be edited from this
page when signed in. Pasting copies the displayed cell values, not formulas
or formatting, and does not keep the table linked to the spreadsheet. Wide
tables can be scrolled horizontally.

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
   with more room reserved for the article than either side column. Select a
   sport in the article editor to show a story on that sport's archive page;
   edit an older story and save it with a sport selected to archive it there.
   Sport-archived stories also remain in the shared library so authorized
   uploaders can keep editing them. Stories set to "Coach's Thoughts only"
   appear only in the shared library, and older plain-text stories remain
   readable there until edited. Choose "EPL Fantasy" in the article
   editor's Article section menu to display the full article in the homepage's
   EPL Fantasy section. Authorized uploaders can edit it there.
   Authorized uploaders can also share `.xlsx`, `.xls`, and `.xlsm`
   workbooks up to 20 MB. Workbooks are stored unchanged, preserving every
   worksheet. Only the most recently uploaded workbook appears as a public
   download link under EPL Fantasy; older uploads remain in storage.
   Visitors can download a copy but cannot modify the shared original; only
   authorized accounts can upload files.

## Must-listen Podcasts

Visitors can open podcast links from Around the office. To add one, sign in
under Coach's Thoughts, then enter its name and an HTTP or HTTPS link in the
Must-listen Podcasts form, with an optional description of up to 500 characters.
Descriptions appear below each podcast link. Links and descriptions are stored
as individual public JSON files in the `podcasts/` folder of the existing
`coach-thoughts` bucket, so the existing authenticated upload policy applies.
The form adds links; it does not edit or remove them. Unauthorized visitors
cannot add links.

## Password recovery

In Supabase Authentication URL Configuration, set the Site URL to
`https://dvroloff-droid.github.io/The-COW/` and add the published page URLs
`https://dvroloff-droid.github.io/The-COW/` and
`https://dvroloff-droid.github.io/The-COW/index.html` to Redirect URLs. Add
other deployment URLs only if they are trusted. If using a custom reset email
template, ensure its link uses `{{ .ConfirmationURL }}` so Supabase verifies the
reset before redirecting back to the site.

On the published site, enter the authorized account's email and select
**Send password reset link** at
`https://dvroloff-droid.github.io/The-COW/#coach-login`. The sign-in form is
hidden from the regular public page, and upload/editing controls remain hidden
there even for signed-in users. This URL reveals those controls; Supabase
authentication and storage policies continue to control access. Open the latest
reset link in the email and enter the new password on the site. Links expire
and can be used only once; request a new one if needed.
