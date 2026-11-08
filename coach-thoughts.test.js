const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/coach-thoughts.js`, "utf8");

function setup(hash = "") {
  const elements = {};
  for (const id of ["status", "login", "reset-request", "reset", "uploader", "upload", "file", "signout", "list"]) {
    elements[id] = {
      hidden: true,
      disabled: false,
      listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      querySelector(selector) {
        return selector.includes("email") ? emailInput : this.button;
      },
      button: { disabled: false },
      replaceChildren() {},
      append() {},
      reset() { this.wasReset = true; },
    };
  }
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
  const bucket = { list: async () => ({ data: [], error: null }) };
  const context = {
    window: {
      location: { origin: "https://example.com", pathname: "/The-COW/", hash },
      COACH_THOUGHTS_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-key" },
      supabase: { createClient: () => ({ auth, storage: { from: () => bucket } }) },
    },
    document: {
      querySelector: (selector) => elements[selector.replace("#thoughts-", "")],
      createElement: () => ({ append() {} }),
    },
    URLSearchParams,
    FormData: class {
      constructor(form) { this.values = form.values; }
      get(name) { return this.values[name]; }
    },
  };
  vm.runInNewContext(script, context);
  return { elements, calls, authEvent: (event, session) => onAuthStateChange(event, session) };
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
