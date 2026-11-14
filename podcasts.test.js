const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/podcasts.js`, "utf8");
const page = fs.readFileSync(`${__dirname}/index.html`, "utf8");

function setup(initial = []) {
  const elements = {};
  for (const id of ["podcast-list", "podcast-status", "podcast-sign-in", "podcast-form", "podcast-title", "podcast-url"]) {
    elements[id] = {
      hidden: false,
      value: "",
      children: [],
      listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      focus() { this.focused = true; },
    };
  }
  const button = { disabled: false };
  elements["podcast-form"].querySelector = () => button;
  elements["podcast-form"].reset = () => {
    elements["podcast-title"].value = "";
    elements["podcast-url"].value = "";
  };
  const objects = new Map(initial.map((entry, index) => [`${index}.json`, JSON.stringify(entry)]));
  const calls = { list: [], uploads: [] };
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
    async upload(name, body, options) {
      calls.uploads.push({ name, options, body: await body.text() });
      if (calls.uploadError) return { error: new Error("upload failed") };
      objects.set(name.slice("podcasts/".length), await body.text());
      return { error: null };
    },
    getPublicUrl(name) { return { data: { publicUrl: `https://storage.example/${name}` } }; },
  };
  const context = {
    window: {},
    document: {
      querySelector: (selector) => elements[selector.slice(1)],
      createElement: (tag) => ({
        tag,
        children: [],
        append(...children) { this.children.push(...children); },
      }),
    },
    URL,
    Blob,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    fetch: async (url) => {
      const name = new URL(url).pathname.split("/").pop();
      if (calls.fetchError || !objects.has(name)) return { ok: false, status: 500 };
      return { ok: true, json: async () => JSON.parse(objects.get(name)) };
    },
  };
  vm.runInNewContext(script, context);
  const podcasts = context.window.createPodcasts();
  return { elements, button, calls, bucket, podcasts };
}

const tick = () => new Promise(setImmediate);
const submit = (elements) => elements["podcast-form"].listeners.submit({ preventDefault() {} });

test("shows safe public podcast links and reports invalid stored entries", async () => {
  const { elements, podcasts, bucket } = setup([
    { title: "Coaching show", url: "https://example.com/podcast" },
    { title: "Bad link", url: "javascript:alert(1)" },
  ]);
  podcasts.start(bucket);
  await tick();
  const links = elements["podcast-list"].children;
  assert.equal(links.length, 1);
  assert.equal(links[0].children[0].textContent, "Coaching show");
  assert.equal(links[0].children[0].href, "https://example.com/podcast");
  assert.equal(links[0].children[0].rel, "noopener noreferrer");
  assert.match(elements["podcast-status"].textContent, /1 podcast link could not be loaded/);
});

test("only signed-in users can add validated links and successful uploads appear publicly", async () => {
  const { elements, podcasts, bucket, calls } = setup();
  podcasts.start(bucket);
  await tick();
  podcasts.setSignedIn(false);
  assert.equal(elements["podcast-form"].hidden, true);
  await submit(elements);
  assert.equal(calls.uploads.length, 0);
  podcasts.setSignedIn(true);
  assert.equal(elements["podcast-form"].hidden, false);
  assert.equal(elements["podcast-sign-in"].hidden, true);
  elements["podcast-title"].value = "  Football talk  ";
  elements["podcast-url"].value = "javascript:alert(1)";
  await submit(elements);
  assert.match(elements["podcast-status"].textContent, /valid HTTP or HTTPS/);
  elements["podcast-url"].value = "https://user:password@example.com/";
  await submit(elements);
  assert.equal(calls.uploads.length, 0);
  elements["podcast-url"].value = "https://example.com/show";
  await submit(elements);
  assert.equal(calls.uploads.length, 1);
  assert.match(calls.uploads[0].name, /^podcasts\/.*\.json$/);
  assert.deepEqual(JSON.parse(calls.uploads[0].body), { title: "Football talk", url: "https://example.com/show" });
  assert.equal(elements["podcast-list"].children[0].children[0].textContent, "Football talk");
  assert.equal(elements["podcast-title"].value, "");
  podcasts.setSignedIn(false);
  assert.equal(elements["podcast-form"].hidden, true);
});

test("keeps the draft on upload failure and reports refresh failure after a successful upload", async () => {
  const { elements, podcasts, bucket, calls } = setup();
  podcasts.start(bucket);
  await tick();
  podcasts.setSignedIn(true);
  elements["podcast-title"].value = "My podcast";
  elements["podcast-url"].value = "https://example.com/";
  calls.uploadError = true;
  await submit(elements);
  assert.match(elements["podcast-status"].textContent, /Could not add podcast: upload failed/);
  assert.equal(elements["podcast-title"].value, "My podcast");
  calls.uploadError = false;
  calls.listError = true;
  await submit(elements);
  assert.match(elements["podcast-status"].textContent, /Podcast added, but the list couldn't fully refresh/);
});

test("loads every page of podcast links", async () => {
  const { elements, podcasts, bucket, calls } = setup(
    Array.from({ length: 101 }, (_, index) => ({ title: `Show ${index}`, url: "https://example.com/" })),
  );
  podcasts.start(bucket);
  await tick();
  assert.equal(elements["podcast-list"].children.length, 101);
  assert.deepEqual(calls.list.map((call) => call.offset), [0, 100]);
});

test("places the podcast section in Around the office and loads its script", () => {
  assert.match(page, /<h3>Must-listen Podcasts<\/h3>/);
  assert.match(page, /id="podcast-form"[^>]*hidden/);
  assert.match(page, /podcasts\.js\?v=20261114-1/);
});
