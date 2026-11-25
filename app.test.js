const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(`${__dirname}/app.js`, "utf8");

test("edition date uses local time and updates at midnight", () => {
  let now = new Date(2026, 10, 25, 23, 59, 0);
  let scheduled;
  const editionDate = { textContent: "" };
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now.getTime()]));
    }
  }
  vm.runInNewContext(script, {
    Date: FakeDate,
    document: {
      documentElement: { classList: { add() {} } },
      querySelector: (selector) => selector === "#edition-date" ? editionDate : null,
    },
    setTimeout: (callback, delay) => { scheduled = { callback, delay }; },
  });

  assert.equal(editionDate.textContent, "WEDNESDAY, NOVEMBER 25, 2026");
  assert.equal(scheduled.delay, 60_000);
  now = new Date(2026, 10, 26, 0, 0, 0);
  scheduled.callback();
  assert.equal(editionDate.textContent, "THURSDAY, NOVEMBER 26, 2026");
});
