const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/coaching-checkout.js`, "utf8");

function render(links) {
  const elements = {
    "single-checkout": { hidden: true },
    "single-unavailable": { hidden: false },
    "package-checkout": { hidden: true },
    "package-unavailable": { hidden: false },
  };
  const errors = [];
  vm.runInNewContext(script, {
    window: { coachingCheckoutLinks: links },
    document: { getElementById: (id) => elements[id] },
    console: { error: (...args) => errors.push(args) },
    URL,
  });
  return { elements, errors };
}

test("checkout remains unavailable without links", () => {
  const { elements } = render({});
  assert.equal(elements["single-checkout"].hidden, true);
  assert.equal(elements["single-unavailable"].hidden, false);
  assert.equal(elements["package-checkout"].hidden, true);
  assert.equal(elements["package-unavailable"].hidden, false);
});

test("configured links enable only their corresponding checkout", () => {
  const { elements } = render({ single: "https://buy.stripe.com/test_single" });
  assert.equal(elements["single-checkout"].href, "https://buy.stripe.com/test_single");
  assert.equal(elements["single-checkout"].hidden, false);
  assert.equal(elements["single-unavailable"].hidden, true);
  assert.equal(elements["package-checkout"].hidden, true);
});

test("invalid links do not enable checkout and report an error", () => {
  for (const value of ["https://example.com/pay", "http://buy.stripe.com/pay", "https://buy.stripe.com/", "not a url"]) {
    const { elements, errors } = render({ package: value });
    assert.equal(elements["package-checkout"].hidden, true);
    assert.equal(elements["package-unavailable"].hidden, false);
    assert.equal(errors.length, 1);
  }
});
