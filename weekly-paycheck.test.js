const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/weekly-paycheck.js`, "utf8");

function setup({ owner = true, session = true } = {}) {
  const elements = {};
  const createElement = (tag) => ({
    tag,
    children: [],
    listeners: {},
    hidden: false,
    value: "",
    textContent: "",
    attributes: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelectorAll(selector) {
      const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
      return descendants(this).filter((node) => selector === ".paycheck-edit" && node.className === "paycheck-edit");
    },
    focus() { this.focused = true; },
  });
  for (const id of [
    "login", "email", "password", "author", "form", "title", "file", "submit",
    "cancel", "signout", "form-heading", "editor-status", "status", "list",
  ]) elements[id] = createElement("div");
  elements.file.files = [];
  elements.form.reset = () => { elements.title.value = ""; elements.file.files = []; };
  const objects = new Map();
  const calls = { uploads: [], list: [] };
  const bucket = {
    async list(path, options) {
      calls.list.push({ path, ...options });
      if (calls.listError) return { error: new Error("list failed") };
      return {
        data: [...objects.keys()].slice(options.offset, options.offset + options.limit)
          .map((name) => ({ id: name, name })),
        error: null,
      };
    },
    async upload(path, body, options) {
      calls.uploads.push({ path, options });
      if (calls.uploadError) return { error: new Error("upload failed") };
      objects.set(path.split("/").pop(), await body.text());
      return { error: null };
    },
    getPublicUrl(path) { return { data: { publicUrl: `https://storage.example/${path}` } }; },
  };
  let onAuth;
  const client = {
    storage: { from: () => bucket },
    auth: {
      onAuthStateChange(callback) { onAuth = callback; },
      async getSession() { return { data: { session: session ? {} : null }, error: null }; },
      async signInWithPassword() { onAuth("SIGNED_IN", {}); return { error: null }; },
      async signOut() { onAuth("SIGNED_OUT", null); return { error: null }; },
    },
  };
  let counter = 0;
  vm.runInNewContext(script, {
    window: {
      location: { hash: owner ? "#coach-login" : "" },
      COACH_THOUGHTS_CONFIG: { supabaseUrl: "https://storage.example", supabaseAnonKey: "public" },
      supabase: { createClient: () => client },
    },
    document: {
      querySelector: (selector) => elements[selector.replace("#paycheck-", "")],
      createElement,
    },
    URL,
    Blob,
    crypto: { randomUUID: () => `uuid-${++counter}` },
    fetch: async (url) => {
      const name = new URL(url).pathname.split("/").pop();
      if (calls.fetchError || !objects.has(name)) return { ok: false, status: 500 };
      return { ok: true, text: async () => objects.get(name) };
    },
  });
  return { elements, objects, calls, auth: (value) => onAuth("SIGNED_IN", value) };
}

const tick = () => new Promise(setImmediate);
const submit = (element) => element.listeners.submit({ preventDefault() {} });

test("publishes a PDF and edits the same post", async () => {
  const { elements, calls, objects } = setup();
  await tick();
  assert.equal(elements.author.hidden, false);
  elements.title.value = " Week 1 ";
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  pdf.name = "week-one.pdf";
  elements.file.files = [pdf];
  await submit(elements.form);
  assert.match(elements["editor-status"].textContent, /published successfully/);
  assert.match(calls.uploads[0].path, /^story-weekly-paycheck\/.+-week-one\.pdf$/);
  assert.equal(calls.uploads[0].options.contentType, "application/pdf");
  assert.match(calls.uploads[1].path, /^story-weekly-paycheck\/.+\.json$/);
  assert.equal(calls.uploads[1].options.upsert, false);
  const article = elements.list.children[0].children[0];
  assert.equal(article.children[0].textContent, "Week 1");
  assert.equal(article.children[1].tag, "iframe");
  assert.equal(article.children[2].tag, "a");
  article.children[3].listeners.click();
  assert.equal(elements.title.value, "Week 1");
  elements.title.value = "Week 1 updated";
  await submit(elements.form);
  assert.equal(calls.uploads[2].path, calls.uploads[1].path);
  assert.equal(calls.uploads[2].options.upsert, true);
  assert.equal(objects.size, 2);
  assert.equal(elements.list.children[0].children[0].children[0].textContent, "Week 1 updated");
});

test("owner mode and authentication are required to publish", async () => {
  const { elements, calls, auth } = setup({ owner: false });
  await tick();
  assert.equal(elements.author.hidden, true);
  elements.title.value = "Title";
  const pdf = new Blob(["%PDF"], { type: "application/pdf" });
  pdf.name = "table.pdf";
  elements.file.files = [pdf];
  await submit(elements.form);
  assert.equal(calls.uploads.length, 0);
  auth({});
  assert.equal(elements.author.hidden, true);
});

test("owner sign-in reveals the PDF upload form", async () => {
  const { elements } = setup({ session: false });
  await tick();
  assert.equal(elements.login.hidden, false);
  assert.equal(elements.author.hidden, true);
  elements.email.value = "coach@example.com";
  elements.password.value = "password";
  await submit(elements.login);
  assert.equal(elements.login.hidden, true);
  assert.equal(elements.author.hidden, false);
  assert.equal(elements.password.value, "");

  const page = fs.readFileSync(`${__dirname}/weekly-paycheck.html`, "utf8");
  assert.match(page, /href="weekly-paycheck\.html\?edit=1#coach-login">Sign in to post a PDF<\/a>/);
  assert.match(page, /<label for="paycheck-file">Spreadsheet PDF<\/label>/);
});

test("reports invalid PDFs and upload failures without discarding the draft", async () => {
  const { elements, calls } = setup();
  await tick();
  elements.title.value = "Title";
  await submit(elements.form);
  assert.match(elements["editor-status"].textContent, /Choose a PDF/);
  assert.equal(calls.uploads.length, 0);
  const pdf = new Blob(["%PDF"], { type: "application/pdf" });
  pdf.name = "table.pdf";
  elements.file.files = [pdf];
  calls.uploadError = true;
  await submit(elements.form);
  assert.match(elements["editor-status"].textContent, /upload failed/);
  assert.equal(elements.file.files[0], pdf);
});

test("verification failure keeps the draft and retry updates the same object", async () => {
  const { elements, calls, objects } = setup();
  await tick();
  elements.title.value = "Title";
  const pdf = new Blob(["%PDF"], { type: "application/pdf" });
  pdf.name = "table.pdf";
  elements.file.files = [pdf];
  calls.fetchError = true;
  await submit(elements.form);
  assert.match(elements["editor-status"].textContent, /could not be verified/);
  assert.equal(elements.title.value, "Title");
  calls.fetchError = false;
  await submit(elements.form);
  assert.equal(calls.uploads[2].path, calls.uploads[1].path);
  assert.equal(calls.uploads[2].options.upsert, true);
  assert.equal(objects.size, 2);
});

test("navigation includes the centered weekly paycheck link on every page", () => {
  for (const page of ["index", "baseball", "basketball", "football", "hockey", "soccer", "coaching-lessons", "weekly-paycheck"]) {
    const html = fs.readFileSync(`${__dirname}/${page}.html`, "utf8");
    assert.match(html, /href="soccer\.html"[^>]*>Soccer<\/a>\s*<a href="weekly-paycheck\.html"[^>]*>The Weekly Paycheck<\/a>/);
  }
  const css = fs.readFileSync(`${__dirname}/styles.css`, "utf8");
  assert.match(css, /\.primary-nav\s*\{[^}]*justify-content:\s*center/s);
});
