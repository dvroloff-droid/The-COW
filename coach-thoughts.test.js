const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/coach-thoughts.js`, "utf8");
const storyContentScript = fs.readFileSync(`${__dirname}/story-content.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/index.html`, "utf8");
const styles = fs.readFileSync(`${__dirname}/styles.css`, "utf8");
const storagePolicies = fs.readFileSync(`${__dirname}/supabase-setup.sql`, "utf8");

test("places article and spreadsheet uploads below the published article archive", () => {
  assert.ok(page.indexOf('class="thoughts-library"') < page.indexOf('id="thoughts-uploader"'));
  assert.ok(page.indexOf('id="thoughts-list"') < page.indexOf('id="thoughts-status"'));
  assert.match(page, /id="gffl-workbooks"/);
  assert.match(page, /styles\.css\?v=20261114-1/);
  assert.match(page, /accept="\.xlsx,\.xls,\.xlsm"/);
  assert.match(page, /story-content\.js\?v=20261112-1/);
  assert.match(page, /coach-thoughts\.js\?v=20261112-1/);
  assert.match(page, /id="thoughts-story-sport"/);
});

test("styles the spreadsheet uploader consistently with the article editor", () => {
  assert.match(styles, /\.thoughts-uploader form\s*\{[^}]*display:\s*grid;/);
  assert.match(styles, /\.thoughts-uploader input,/);
});

test("uses smaller text for published article bodies and supports pictures", () => {
  assert.equal((styles.match(/font-size: 10pt;/g) || []).length, 3);
  assert.match(styles, /\.hero-inner\.newspaper-reading \.shared-story-body\s*\{[^}]*font-size:\s*10pt;/);
  assert.match(styles, /\.shared-story-body\s*\{[^}]*text-align:\s*justify;/);
  assert.doesNotMatch(styles, /\.shared-story-article\s*\{[^}]*text-align:\s*center;/);
  assert.match(styles, /\.shared-story-body p\s*\{[^}]*white-space:\s*normal;[^}]*text-align:\s*justify;[^}]*text-align-last:\s*start;[^}]*hyphens:\s*auto;/);
  assert.match(page, /id="thoughts-story-add-image"[^>]*>Add picture<\/button>/);
});

test("styles published columns as weathered gray newsprint with frayed edges", () => {
  assert.match(styles, /\.shared-story-article\s*\{[^}]*color:\s*#3d3c39;[^}]*background:[^}]*#d8d7d0[^}]*clip-path:\s*polygon\(/);
  assert.match(styles, /\.shared-story-article \.shared-story-body blockquote\s*\{[^}]*border-left-color:\s*#77766f;/);
});

test("keeps shared storage publicly readable and limits authorized updates to stories", () => {
  assert.match(storagePolicies, /'coach-thoughts'\s*,\s*'coach-thoughts'\s*,\s*true\s*,\s*20971520/i);
  assert.match(storagePolicies, /for select\s+to anon, authenticated/i);
  assert.match(storagePolicies, /for insert\s+to authenticated/i);
  assert.match(storagePolicies, /for update\s+to authenticated\s+using\s*\(bucket_id = 'coach-thoughts' and name like 'story-%'\)/i);
  assert.doesNotMatch(storagePolicies, /for delete/i);
});

function setup(hash = "", sharedFiles = [], downloadText = null, storyNodes = []) {
  const elements = {};
  for (const id of [
    "status", "login", "reset-request", "reset", "uploader", "upload", "file",
    "spreadsheet", "spreadsheet-file", "spreadsheet-status", "gffl-workbooks",
    "story", "story-title", "story-editor", "story-add-image", "story-image",
    "story-sport", "story-again", "story-status",
    "signout", "list",
  ]) {
    elements[id] = {
      hidden: true,
      disabled: false,
      value: "",
      dataset: {},
      innerHTML: "",
      textContent: "",
      files: [],
      listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      querySelectorAll() { return []; },
      querySelector(selector) {
        if (selector.includes("email")) return emailInput;
        if (selector === 'details[open]') {
          return this.children.flatMap((item) => item.children)
            .find((child) => child.tagName === "details" && child.open) || null;
        }
        return this.button;
      },
      button: { disabled: false },
      children: [],
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      contains() { return false; },
      focus() { this.focused = true; },
      reset() { this.wasReset = true; },
    };
  }
  elements.file.files = [];
  elements["story-editor"].querySelector = () => null;
  const heroInner = { classList: { add() {}, remove() {} } };
  const emailInput = { value: "coach@example.com", reportValidity: () => true };
  const calls = {};
  const uploadedStories = new Map();
  let readOverride = null;
  let onAuthStateChange;
  const auth = {
    onAuthStateChange(callback) { onAuthStateChange = callback; },
    getSession: async () => ({ data: { session: null }, error: null }),
    resetPasswordForEmail: async (email, options) => {
      calls.reset = { email, options };
      return { error: null };
    },
    signInWithPassword: async (credentials) => {
      calls.signIn = credentials;
      return { error: null };
    },
    updateUser: async (attributes) => {
      calls.update = attributes;
      return { error: null };
    },
  };
  const bucket = {
    list: async () => ({ data: sharedFiles, error: null }),
    upload: async (name, body, options) => {
      calls.upload = { name, body, options };
      if (name.startsWith("story-") && !name.startsWith("story-images/")) {
        uploadedStories.set(name, await body.text());
      }
      if (options?.upsert) {
        const existing = sharedFiles.find((file) => file.name === name);
        if (existing) existing.updated = true;
        else sharedFiles.unshift({ id: name, name });
      } else {
        sharedFiles.unshift({ id: name, name });
      }
      return { error: null };
    },
    getPublicUrl: (name, options) => ({
      data: {
        publicUrl: `https://example.supabase.co/storage/v1/object/public/coach-thoughts/${name}${options?.download ? "?download" : ""}`,
      },
    }),
  };
  const createElement = (tagName) => ({
    tagName,
    children: [],
    listeners: {},
    attributes: {},
    addEventListener(event, callback) { this.listeners[event] = callback; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    getAttribute(name) { return this.attributes[name] || null; },
    scrollIntoView() { this.scrolledIntoView = true; },
    open: false,
  });
  const context = {
    window: {
      location: { origin: "https://example.com", pathname: "/The-COW/", hash },
      COACH_THOUGHTS_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-key" },
      supabase: { createClient: () => ({ auth, storage: { from: () => bucket } }) },
      getSelection: () => null,
    },
    document: {
      querySelector: (selector) => selector === ".hero-inner"
        ? heroInner
        : elements[selector.replace(/^#(?:thoughts-)?/, "")],
      createElement,
      createTextNode: (textContent) => ({ nodeType: 3, textContent }),
      execCommand() {},
    },
    URLSearchParams,
    URL,
    Blob,
    fetch: async (url, options) => {
      const parsed = new URL(url);
      const name = decodeURIComponent(parsed.pathname.split("/").pop());
      calls.download = name;
      calls.read = { url: parsed, options };
      const text = readOverride ?? uploadedStories.get(name) ??
        downloadText ?? "<script>story text</script>\n\nA second paragraph.";
      return { ok: true, text: async () => text };
    },
    DOMParser: class {
      parseFromString() { return { body: { childNodes: storyNodes } }; }
    },
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    FormData: class {
      constructor(form) { this.values = form.values; }
      get(name) { return this.values[name]; }
    },
  };
  vm.runInNewContext(storyContentScript, context);
  vm.runInNewContext(script, context);
  return {
    elements,
    calls,
    bucket,
    setReadOverride: (text) => { readOverride = text; },
    authEvent: (event, session) => onAuthStateChange(event, session),
  };
}

test("requests a recovery link using the current site URL", async () => {
  const { elements, calls } = setup();
  await elements["reset-request"].listeners.click();
  assert.equal(calls.reset.email, "coach@example.com");
  assert.equal(calls.reset.options.redirectTo, "https://example.com/The-COW/");
  assert.match(elements.status.textContent, /check its inbox/);
});

test("existing password sign-in continues to work", async () => {
  const { elements, calls, authEvent } = setup();
  await new Promise(setImmediate);
  elements.login.values = { email: "coach@example.com", password: "password" };
  await elements.login.listeners.submit({ preventDefault() {} });
  assert.equal(calls.signIn.email, "coach@example.com");
  assert.equal(calls.signIn.password, "password");
  authEvent("SIGNED_IN", { user: {} });
  assert.equal(elements.login.hidden, true);
  assert.equal(elements.uploader.hidden, false);
});

test("shares Excel workbooks unchanged through public read-only download links", async () => {
  for (const [filename, contentType] of [
    ["league.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["league.xls", "application/vnd.ms-excel"],
    ["league.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
  ]) {
    const { elements, calls } = setup();
    await new Promise(setImmediate);
    const workbook = new Blob(["complete workbook"], { type: contentType });
    workbook.name = filename;
    elements["spreadsheet-file"].files = [workbook];

    await elements.spreadsheet.listeners.submit({ preventDefault() {} });

    assert.match(calls.upload.name, new RegExp(`-${filename}$`));
    assert.equal(calls.upload.body, workbook);
    assert.equal(calls.upload.options.contentType, contentType);
    assert.equal(calls.upload.options.upsert, false);
    assert.equal(elements.spreadsheet.wasReset, true);
    assert.match(elements["spreadsheet-status"].textContent, /public download link is under The GFFL/);
    const sharedWorkbookLink = elements["gffl-workbooks"].children[0].children[0];
    assert.equal(sharedWorkbookLink.textContent, filename);
    assert.match(sharedWorkbookLink.href, /\?download$/);
    assert.equal(elements.list.children[0].textContent, "No articles or other shared files have been published.");
  }
});

test("keeps GFFL workbooks under GFFL while articles stay in the published archive", async () => {
  const { elements } = setup("", [
    { id: "workbook-id", name: "00000000-0000-4000-8000-000000000001-League-Standings.xlsx" },
    { id: "story-id", name: "story-00000000-0000-4000-8000-000000000002-League-update.json" },
    { id: "pdf-id", name: "00000000-0000-4000-8000-000000000003-rules.pdf" },
  ]);
  await new Promise(setImmediate);

  assert.equal(elements["gffl-workbooks"].children.length, 1);
  assert.equal(elements["gffl-workbooks"].children[0].children[0].textContent, "League-Standings.xlsx");
  assert.equal(elements.list.children.length, 2);
  assert.equal(elements.list.children[0].children[0].tagName, "details");
  assert.equal(elements.list.children[1].children[0].textContent, "rules.pdf");
});

test("lists only the latest upload for each workbook filename", async () => {
  const { elements } = setup("", [
    {
      id: "older-workbook",
      name: "00000000-0000-4000-8000-000000000001-League-Standings.xlsx",
      created_at: "2026-11-08T12:00:00Z",
    },
    {
      id: "newer-workbook",
      name: "00000000-0000-4000-8000-000000000002-league-standings.xlsx",
      created_at: "2026-11-09T12:00:00Z",
    },
    {
      id: "other-workbook",
      name: "00000000-0000-4000-8000-000000000003-Playoff-Bracket.xlsx",
      created_at: "2026-11-09T13:00:00Z",
    },
  ]);
  await new Promise(setImmediate);

  assert.equal(elements["gffl-workbooks"].children.length, 2);
  assert.equal(elements["gffl-workbooks"].children[0].children[0].textContent, "league-standings.xlsx");
  assert.match(
    elements["gffl-workbooks"].children[0].children[0].href,
    /00000000-0000-4000-8000-000000000002-league-standings\.xlsx\?download$/,
  );
  assert.equal(elements["gffl-workbooks"].children[1].children[0].textContent, "Playoff-Bracket.xlsx");
});

test("rejects unsupported and oversized files before uploading", async () => {
  const { elements, calls } = setup();
  await new Promise(setImmediate);
  const unsupportedFile = new Blob(["not a workbook"]);
  unsupportedFile.name = "notes.pdf";
  elements["spreadsheet-file"].files = [unsupportedFile];

  await elements.spreadsheet.listeners.submit({ preventDefault() {} });

  assert.match(elements["spreadsheet-status"].textContent, /Choose an \.xlsx, \.xls, or \.xlsm/);
  assert.equal(calls.upload, undefined);
  const oversizedFile = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]);
  oversizedFile.name = "league.xlsx";
  elements["spreadsheet-file"].files = [oversizedFile];

  await elements.spreadsheet.listeners.submit({ preventDefault() {} });

  assert.match(elements["spreadsheet-status"].textContent, /no larger than 20 MB/);
  assert.equal(calls.upload, undefined);
});

test("reports spreadsheet upload errors without discarding the selected workbook", async () => {
  const { elements, bucket } = setup();
  await new Promise(setImmediate);
  const workbook = new Blob(["complete workbook"]);
  workbook.name = "league.xlsx";
  elements["spreadsheet-file"].files = [workbook];
  bucket.upload = async () => ({ error: { message: "Permission denied" } });

  await elements.spreadsheet.listeners.submit({ preventDefault() {} });

  assert.match(elements["spreadsheet-status"].textContent, /Could not share workbook: Permission denied/);
  assert.equal(elements["spreadsheet-status"].dataset.state, "error");
  assert.equal(elements.spreadsheet.wasReset, undefined);
  assert.equal(elements.spreadsheet.button.disabled, false);
});

test("reports a list refresh failure in the GFFL section after an upload", async () => {
  const { elements, bucket } = setup();
  await new Promise(setImmediate);
  const workbook = new Blob(["complete workbook"]);
  workbook.name = "league.xlsx";
  elements["spreadsheet-file"].files = [workbook];
  bucket.list = async () => ({ data: null, error: { message: "List unavailable" } });

  await elements.spreadsheet.listeners.submit({ preventDefault() {} });

  assert.match(elements["spreadsheet-status"].textContent, /uploaded, but The GFFL list couldn't refresh/);
  assert.match(elements["gffl-workbooks"].children[0].textContent, /Could not load GFFL workbooks/);
  assert.match(elements.status.textContent, /List unavailable/);
});

test("recovery requires matching passwords and updates the account", async () => {
  const { elements, calls, authEvent } = setup();
  await new Promise(setImmediate);
  authEvent("PASSWORD_RECOVERY", { user: {} });
  assert.equal(elements.reset.hidden, false);
  assert.equal(elements.uploader.hidden, true);
  elements.reset.values = { password: "new-password", confirmation: "different" };
  await elements.reset.listeners.submit({ preventDefault() {} });
  assert.equal(calls.update, undefined);
  assert.match(elements.status.textContent, /do not match/);
  elements.reset.values.confirmation = "new-password";
  await elements.reset.listeners.submit({ preventDefault() {} });
  assert.equal(calls.update.password, "new-password");
  assert.equal(elements.reset.hidden, true);
  assert.equal(elements.uploader.hidden, false);
});

test("expired recovery links show an actionable error", async () => {
  const { elements } = setup("#error=access_denied&error_description=Link+expired");
  await new Promise(setImmediate);
  assert.match(elements.status.textContent, /Link expired.*Request a new link/);
});

test("publishes a full article as a formatted shared file", async () => {
  const { elements, calls } = setup();
  await new Promise(setImmediate);
  elements["story-title"].value = "A complete story";
  elements["story-editor"].textContent = "with a second paragraph.";
  elements["story-editor"].innerHTML = "<p>with a second paragraph.</p>";

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.equal(
    calls.upload.name,
    "story-00000000-0000-4000-8000-000000000001-A-complete-story.json",
  );
  assert.equal(calls.upload.options.contentType, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(await calls.upload.body.text()), {
    title: "A complete story",
    html: "<p>with a second paragraph.</p>",
    sport: "",
  });
  assert.equal(elements.story.wasReset, true);
  assert.equal(elements.story.hidden, true);
  assert.equal(elements["story-again"].hidden, false);
  assert.match(elements["story-status"].textContent, /Article published successfully/);
  const publishedStory = elements.list.children[0].children[0];
  assert.equal(publishedStory.open, true);
  assert.equal(publishedStory.scrolledIntoView, true);

  await elements["story-again"].listeners.click();
  assert.equal(elements.story.hidden, false);
  assert.equal(elements["story-again"].hidden, true);
  assert.equal(elements["story-title"].focused, true);
});

test("edits a published article in place and preserves its file name", async () => {
  const storyName = "story-00000000-0000-4000-8000-000000000001-GFFL-Update.json";
  const { elements, calls, authEvent } = setup("", [
    { id: "story-id", name: storyName },
  ], JSON.stringify({ title: "The GFFL Update", html: "<p>Existing article.</p>", sport: "basketball" }));
  await new Promise(setImmediate);
  authEvent("SIGNED_IN", { user: {} });

  const editButton = elements.list.children[0].children[0].children[1].children[0].children[2];
  assert.equal(editButton.textContent, "Edit article");
  assert.equal(editButton.hidden, false);
  await editButton.listeners.click();

  assert.equal(elements.story.hidden, false);
  assert.equal(elements["story-title"].value, "The GFFL Update");
  assert.equal(elements["story-sport"].value, "basketball");
  assert.equal(elements.story.button.textContent, "Save changes");
  elements["story-sport"].value = "baseball";
  elements["story-editor"].textContent = "Updated with a picture.";
  elements["story-editor"].innerHTML = "<p>Updated with a picture.</p><figure><img src=\"https://example.supabase.co/image.png\"></figure>";
  await elements.story.listeners.submit({ preventDefault() {} });

  assert.equal(calls.upload.name, storyName);
  assert.equal(calls.upload.options.upsert, true);
  assert.equal(calls.upload.options.cacheControl, "0");
  assert.equal(calls.read.options.cache, "no-store");
  assert.ok(calls.read.url.searchParams.get("version"));
  assert.deepEqual(JSON.parse(await calls.upload.body.text()), {
    title: "The GFFL Update",
    html: "<p>Updated with a picture.</p><figure><img src=\"https://example.supabase.co/image.png\"></figure>",
    sport: "baseball",
  });
  assert.match(elements["story-status"].textContent, /Article updated successfully/);
  assert.equal(elements.story.button.textContent, "Publish story");
});

test("keeps the draft when the published copy cannot be verified", async () => {
  const storyName = "story-00000000-0000-4000-8000-000000000001-Update.json";
  const oldStory = JSON.stringify({ title: "Update", html: "<p>Old article.</p>" });
  const { elements, authEvent, setReadOverride } = setup("", [
    { id: "story-id", name: storyName },
  ], oldStory);
  await new Promise(setImmediate);
  authEvent("SIGNED_IN", { user: {} });
  const editButton = elements.list.children[0].children[0].children[1].children[0].children[2];
  await editButton.listeners.click();
  elements["story-editor"].textContent = "New article";
  elements["story-editor"].innerHTML = "<p>New article</p>";
  setReadOverride(oldStory);

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.equal(elements.story.wasReset, undefined);
  assert.equal(elements["story-editor"].innerHTML, "<p>New article</p>");
  assert.equal(elements.story.hidden, false);
  assert.equal(elements["story-status"].dataset.state, "error");
  assert.match(elements["story-status"].textContent, /unable to verify.*draft is still here/i);
});

test("keeps an edited article and reports a storage permission error", async () => {
  const storyName = "story-00000000-0000-4000-8000-000000000001-Update.json";
  const { elements, bucket, authEvent } = setup("", [
    { id: "story-id", name: storyName },
  ], JSON.stringify({ title: "Update", html: "<p>Original.</p>" }));
  await new Promise(setImmediate);
  authEvent("SIGNED_IN", { user: {} });
  const editButton = elements.list.children[0].children[0].children[1].children[0].children[2];
  await editButton.listeners.click();
  elements["story-editor"].textContent = "Changed.";
  elements["story-editor"].innerHTML = "<p>Changed.</p>";
  bucket.upload = async () => ({ error: { message: "Permission denied" } });

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.equal(elements["story-editor"].innerHTML, "<p>Changed.</p>");
  assert.equal(elements.story.hidden, false);
  assert.match(elements["story-status"].textContent, /Could not update article: Permission denied/);
});

test("waits for picture uploads before saving an article", async () => {
  const { elements, bucket, calls } = setup();
  await new Promise(setImmediate);
  elements["story-title"].value = "Headline";
  elements["story-editor"].textContent = "Article";
  elements["story-editor"].innerHTML = "<p>Article</p>";
  const image = new Blob(["picture"], { type: "image/png" });
  image.name = "photo.png";
  elements["story-image"].files = [image];
  let finishUpload;
  const originalUpload = bucket.upload;
  bucket.upload = async (...args) => {
    await new Promise((resolve) => { finishUpload = resolve; });
    return originalUpload(...args);
  };

  const uploading = elements["story-image"].listeners.change();
  assert.equal(elements.story.button.disabled, true);
  await elements.story.listeners.submit({ preventDefault() {} });
  assert.equal(calls.upload, undefined);
  assert.match(elements["story-status"].textContent, /wait.*picture upload/i);
  finishUpload();
  await uploading;
  assert.equal(elements.story.button.disabled, false);
  assert.equal(elements["story-editor"].children[0].children[0].tagName, "img");
});

test("edits a legacy text story so pictures can be added", async () => {
  const storyName = "story-00000000-0000-4000-8000-000000000001-Week-5-Update.txt";
  const { elements, calls, authEvent } = setup("", [
    { id: "story-id", name: storyName },
  ], "Week 5 Update\n\nThe first paragraph.\n\nThe second paragraph.");
  await new Promise(setImmediate);
  authEvent("SIGNED_IN", { user: {} });

  const editButton = elements.list.children[0].children[0].children[1].children[0].children[2];
  assert.equal(editButton.textContent, "Edit article");
  assert.equal(editButton.hidden, false);
  await editButton.listeners.click();

  assert.equal(elements["story-title"].value, "Week 5 Update");
  assert.equal(elements["story-editor"].children.length, 2);
  assert.equal(elements["story-editor"].children[0].textContent, "The first paragraph.");

  elements["story-editor"].textContent = "Updated with a picture.";
  elements["story-editor"].innerHTML = "<p>Updated with a picture.</p><figure><img src=\"https://example.supabase.co/image.png\"></figure>";
  await elements.story.listeners.submit({ preventDefault() {} });

  assert.equal(calls.upload.name, storyName);
  assert.equal(calls.upload.options.upsert, true);
  assert.deepEqual(JSON.parse(await calls.upload.body.text()), {
    title: "Week 5 Update",
    html: "<p>Updated with a picture.</p><figure><img src=\"https://example.supabase.co/image.png\"></figure>",
    sport: "",
  });
});

test("opens edited legacy stories after their content is saved as JSON", async () => {
  const { elements, calls } = setup("", [{
    id: "story-id",
    name: "story-00000000-0000-4000-8000-000000000001-Week-5-Update.txt",
  }], JSON.stringify({ title: "Week 5 Update", html: "<p>Updated article.</p>" }));
  await new Promise(setImmediate);

  const details = elements.list.children[0].children[0];
  await details.listeners.toggle();

  const storyArticle = details.children[1];
  assert.equal(storyArticle.children[0].children[1].textContent, "Week 5 Update");
  assert.equal(calls.download, "story-00000000-0000-4000-8000-000000000001-Week-5-Update.txt");
});

test("shows clear validation when an article has no headline", async () => {
  const { elements, calls } = setup();
  await new Promise(setImmediate);
  elements["story-editor"].textContent = "Article text";
  elements["story-editor"].innerHTML = "<p>Article text</p>";

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.match(elements["story-status"].textContent, /Enter a headline/);
  assert.equal(elements["story-title"].focused, true);
  assert.equal(calls.upload, undefined);
});

test("shows publishing errors beside the editor and preserves the draft", async () => {
  const { elements, bucket } = setup();
  await new Promise(setImmediate);
  elements["story-title"].value = "A headline";
  elements["story-editor"].textContent = "Article text";
  elements["story-editor"].innerHTML = "<p>Article text</p>";
  bucket.upload = async () => ({ error: { message: "Permission denied" } });

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.match(elements["story-status"].textContent, /Could not publish story: Permission denied/);
  assert.equal(elements["story-status"].dataset.state, "error");
  assert.equal(elements.story.wasReset, undefined);
  assert.equal(elements.story.button.disabled, false);
});

test("distinguishes a successful upload from a failed list refresh", async () => {
  const { elements, bucket } = setup();
  await new Promise(setImmediate);
  elements["story-title"].value = "A headline";
  elements["story-editor"].textContent = "Article text";
  elements["story-editor"].innerHTML = "<p>Article text</p>";
  bucket.list = async () => ({ data: null, error: { message: "List unavailable" } });

  await elements.story.listeners.submit({ preventDefault() {} });

  assert.match(elements["story-status"].textContent, /Article published, but it couldn't be opened/);
  assert.match(elements.status.textContent, /List unavailable/);
  assert.equal(elements.story.wasReset, true);
});

test("loads published stories as plain text in the shared list", async () => {
  const { elements, calls } = setup("", [{
    id: "story-id",
    name: "story-00000000-0000-4000-8000-000000000001-A-complete-story.txt",
  }]);
  await new Promise(setImmediate);

  const details = elements.list.children[0].children[0];
  const storyArticle = details.children[1];
  const [storyHeader, storyBody] = storyArticle.children;
  details.open = true;
  await details.listeners.toggle();

  assert.equal(
    calls.download,
    "story-00000000-0000-4000-8000-000000000001-A-complete-story.txt",
  );
  assert.equal(details.children[0].textContent, "A complete story");
  assert.equal(storyHeader.children[0].textContent, "COACH'S NOTEBOOK");
  assert.equal(storyHeader.children[1].textContent, "<script>story text</script>");
  assert.equal(storyBody.children.length, 1);
  assert.equal(storyBody.children[0].textContent, "A second paragraph.");
});

test("opens the newest published article inline instead of leaving it as a link", async () => {
  const newestStory = {
    id: "newest-story",
    name: "story-00000000-0000-4000-8000-000000000002-Newest-story.json",
  };
  const olderStory = {
    id: "older-story",
    name: "story-00000000-0000-4000-8000-000000000001-Older-story.json",
  };
  const { elements, calls } = setup("", [newestStory, olderStory], JSON.stringify({
    title: "Newest story",
    html: "<p>Article body</p>",
  }));
  await new Promise(setImmediate);

  const newestDetails = elements.list.children[0].children[0];
  const olderDetails = elements.list.children[1].children[0];
  assert.equal(newestDetails.tagName, "details");
  assert.equal(newestDetails.open, true);
  assert.equal(olderDetails.open, false);

  await newestDetails.listeners.toggle();

  assert.equal(calls.download, newestStory.name);
  assert.equal(newestDetails.children[1].children[0].children[1].textContent, "Newest story");
});

test("uploads an image for a newspaper column", async () => {
  const { elements, calls } = setup();
  await new Promise(setImmediate);
  const image = new Blob(["picture"], { type: "image/png" });
  image.name = "team-photo.png";
  elements["story-image"].files = [image];

  await elements["story-image"].listeners.change();

  assert.equal(calls.upload.name, "story-images/00000000-0000-4000-8000-000000000001-team-photo.png");
  assert.equal(calls.upload.options.contentType, "image/png");
  const figure = elements["story-editor"].children[0];
  assert.equal(figure.children[0].tagName, "img");
  assert.match(figure.children[0].src, /story-images\/00000000-0000-4000-8000-000000000001-team-photo\.png$/);
});

test("uploads pasted pictures into shared storage for a newspaper column", async () => {
  const { elements, calls } = setup();
  await new Promise(setImmediate);
  const image = new Blob(["picture"], { type: "image/png" });
  image.name = "pasted-picture.png";
  let prevented = false;

  await elements["story-editor"].listeners.paste({
    clipboardData: {
      items: [{ type: "image/png", getAsFile: () => image }],
    },
    preventDefault() { prevented = true; },
  });

  assert.equal(prevented, true);
  assert.equal(calls.upload.name, "story-images/00000000-0000-4000-8000-000000000001-pasted-picture.png");
  assert.equal(calls.upload.options.contentType, "image/png");
  const figure = elements["story-editor"].children[0];
  assert.equal(figure.children[0].tagName, "img");
  assert.match(figure.children[0].src, /story-images\/00000000-0000-4000-8000-000000000001-pasted-picture\.png$/);
});

test("renders only safe column formatting and site-hosted pictures", async () => {
  const nodes = [
    { nodeType: 1, tagName: "P", childNodes: [{ nodeType: 3, textContent: "Column text" }] },
    {
      nodeType: 1,
      tagName: "IMG",
      attributes: {
        src: "https://example.supabase.co/storage/v1/object/public/coach-thoughts/story-images/photo.png",
        alt: "Team photo",
      },
      getAttribute(name) { return this.attributes[name] || null; },
    },
    { nodeType: 1, tagName: "SCRIPT", childNodes: [{ nodeType: 3, textContent: "unsafe()" }] },
    {
      nodeType: 1,
      tagName: "IMG",
      attributes: { src: "https://attacker.example/photo.png", alt: "External" },
      getAttribute(name) { return this.attributes[name] || null; },
    },
  ];
  const { elements } = setup("", [{
    id: "story-id",
    name: "story-00000000-0000-4000-8000-000000000001-A-column.json",
  }], JSON.stringify({ title: "Game-day column", html: "<p>content</p>" }), nodes);
  await new Promise(setImmediate);

  const details = elements.list.children[0].children[0];
  details.open = true;
  await details.listeners.toggle();

  const storyArticle = details.children[1];
  assert.equal(storyArticle.children[0].children[1].textContent, "Game-day column");
  assert.equal(storyArticle.children[1].children.length, 2);
  assert.equal(storyArticle.children[1].children[0].children[0].textContent, "Column text");
  assert.equal(
    storyArticle.children[1].children[1].src,
    "https://example.supabase.co/storage/v1/object/public/coach-thoughts/story-images/photo.png",
  );
});
