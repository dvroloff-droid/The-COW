const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const archiveScript = fs.readFileSync(`${__dirname}/sports-archive.js`, "utf8");
const storyContentScript = fs.readFileSync(`${__dirname}/story-content.js`, "utf8");

function setup({ files = [], stories = {}, sport = "baseball", listError = null } = {}) {
  const status = { textContent: "" };
  const articleList = {
    children: [],
    replaceChildren(...children) { this.children = children; },
  };
  const archive = { dataset: { sport } };
  const elements = {
    "#archive-stories": archive,
    "#archive-status": status,
    "#archive-list": articleList,
  };
  const bucket = {
    list: async (_path, options) => {
      if (listError) return { data: null, error: listError };
      return { data: files.slice(options.offset, options.offset + options.limit), error: null };
    },
    getPublicUrl: (name) => ({
      data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/coach-thoughts/${name}` },
    }),
  };
  const createElement = (tagName) => ({
    tagName,
    children: [],
    append(...children) { this.children.push(...children); },
  });
  const context = {
    window: {
      location: { href: "https://example.com/baseball.html" },
      COACH_THOUGHTS_CONFIG: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "public-key",
      },
      COACH_THOUGHTS_STORIES: null,
      supabase: {
        createClient: () => ({ storage: { from: () => bucket } }),
      },
    },
    document: {
      querySelector: (selector) => elements[selector] || null,
      createElement,
      createTextNode: (textContent) => ({ nodeType: 3, textContent }),
    },
    URL,
    fetch: async (url) => {
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop());
      const text = stories[name];
      return text === undefined
        ? { ok: false, status: 404 }
        : { ok: true, text: async () => text };
    },
    DOMParser: class {
      parseFromString() { return { body: { childNodes: [] } }; }
    },
  };
  vm.runInNewContext(storyContentScript, context);
  vm.runInNewContext(archiveScript, context);
  return { status, articleList };
}

test("shows each sport's published articles and excludes stories assigned elsewhere", async () => {
  const baseballFile = "story-baseball.json";
  const footballFile = "story-football.json";
  const { status, articleList } = setup({
    files: [
      { id: baseballFile, name: baseballFile, created_at: "2026-11-10T00:00:00Z" },
      { id: footballFile, name: footballFile, created_at: "2026-11-11T00:00:00Z" },
    ],
    stories: {
      [baseballFile]: JSON.stringify({
        title: "An older baseball story",
        html: "<p>Baseball article text.</p>",
        sport: "baseball",
      }),
      [footballFile]: JSON.stringify({
        title: "Football story",
        html: "<p>Football article text.</p>",
        sport: "football",
      }),
    },
  });
  await new Promise(setImmediate);

  assert.match(status.textContent, /1 archived article/);
  assert.equal(articleList.children.length, 1);
  assert.equal(articleList.children[0].children[0].children[0].children[1].textContent, "An older baseball story");
});

test("reports archive listing failures instead of showing an empty archive", async () => {
  const { status, articleList } = setup({ listError: { message: "Permission denied" } });
  await new Promise(setImmediate);

  assert.match(status.textContent, /Could not load the sports archive: Permission denied/);
  assert.equal(articleList.children.length, 0);
});

test("sports archive pages point to their matching category", () => {
  for (const sport of ["baseball", "football", "basketball", "hockey", "soccer"]) {
    const page = fs.readFileSync(`${__dirname}/${sport}.html`, "utf8");
    assert.match(page, new RegExp(`id="archive-stories" data-sport="${sport}"`));
    assert.match(page, /sports-archive\.js\?v=/);
  }
});
