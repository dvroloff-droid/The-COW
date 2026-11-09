const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/coach-thoughts.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/index.html`, "utf8");

test("places the story editor below the published article archive without generic uploads", () => {
  assert.ok(page.indexOf('class="thoughts-library"') < page.indexOf('id="thoughts-uploader"'));
  assert.ok(page.indexOf('id="thoughts-list"') < page.indexOf('id="thoughts-status"'));
  assert.doesNotMatch(page, /id="thoughts-upload"|id="thoughts-file"|Choose a file|Upload file/i);
  assert.match(page, /coach-thoughts\.js\?v=20261108-6/);
});

function setup(hash = "", sharedFiles = [], downloadText = null, storyNodes = []) {
  const elements = {};
  for (const id of [
    "status", "login", "reset-request", "reset", "uploader", "upload", "file",
    "story", "story-title", "story-editor", "story-add-image", "story-image",
    "story-again", "story-status",
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
      sharedFiles.unshift({ id: name, name });
      return { error: null };
    },
    download: async (name) => {
      calls.download = name;
      return {
        data: new Blob([downloadText || "<script>story text</script>\n\nA second paragraph."]),
        error: null,
      };
    },
    getPublicUrl: (name) => ({
      data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/coach-thoughts/${name}` },
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
        : elements[selector.replace("#thoughts-", "")],
      createElement,
      createTextNode: (textContent) => ({ nodeType: 3, textContent }),
      execCommand() {},
    },
    URLSearchParams,
    URL,
    Blob,
    DOMParser: class {
      parseFromString() { return { body: { childNodes: storyNodes } }; }
    },
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    FormData: class {
      constructor(form) { this.values = form.values; }
      get(name) { return this.values[name]; }
    },
  };
  vm.runInNewContext(script, context);
  return {
    elements,
    calls,
    bucket,
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
