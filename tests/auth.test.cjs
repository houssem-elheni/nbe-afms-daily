const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "auth.js"), "utf8");
const uid = "CVWWBPx3ECQDroNRmN1NQ3kIFau2";
const email = "nbeops@nbe-afms.local";
const flush = () => new Promise(resolve => setImmediate(resolve));

async function harness(options = {}) {
  const elements = {};
  function element(id) {
    if (!elements[id]) elements[id] = {
      hidden: id === "appShell", inert: id === "appShell", value: "", disabled: false,
      textContent: "", events: {},
      addEventListener(name, handler) { this.events[name] = handler; },
      focus() { this.focused = true; }, remove() {}
    };
    return elements[id];
  }
  const calls = { scripts: [], signIns: [], signOuts: 0, reloads: 0, tokenChecks: 0 };
  const user = {
    uid, email,
    async getIdToken(forceRefresh) {
      calls.tokenChecks++;
      assert.equal(forceRefresh, true);
      if (options.tokenError) throw new Error("expired-session");
      if (options.tokenPromise) await options.tokenPromise;
      return "test-token";
    }
  };
  const auth = { currentUser: options.restored ? user : null };
  let listener;
  const sdk = {
    browserSessionPersistence: { type: "SESSION" },
    getAuth: () => auth,
    async setPersistence(_auth, persistence) {
      assert.equal(persistence.type, "SESSION");
      if (options.storageError) throw new Error("storage-blocked");
    },
    onAuthStateChanged(_auth, callback) {
      listener = callback;
      callback(auth.currentUser);
    },
    async signInWithEmailAndPassword(_auth, address, password) {
      calls.signIns.push({ address, password });
      if (options.signInError) throw { code: options.signInError };
      auth.currentUser = user;
      listener(user);
      return { user };
    },
    async signOut() {
      calls.signOuts++;
      auth.currentUser = null;
      listener(null);
    }
  };
  const context = vm.createContext({
    document: {
      getElementById: element,
      createElement: () => ({ remove() {} }),
      head: { appendChild(script) {
        calls.scripts.push(script.src);
        queueMicrotask(() => options.scriptError ? script.onerror() : script.onload());
      } }
    },
    window: { location: { reload() { calls.reloads++; } } },
    async testImport(url) {
      if (options.importError) throw new Error("offline");
      return url.endsWith("firebase-auth.js") ? sdk : {
        getApps: () => [], initializeApp: () => ({ name: "nbe-afms" })
      };
    }
  });
  vm.runInContext(source.replaceAll("import(", "testImport("), context);
  await flush();
  return {
    elements, calls, auth,
    async submit(username = "nbeops", password = "test-password") {
      element("loginUsername").value = username;
      element("loginPassword").value = password;
      await element("loginForm").events.submit({ preventDefault() {} });
      await flush();
    },
    async changeUser(nextUser) {
      auth.currentUser = nextUser;
      await listener(nextUser);
      await flush();
    }
  };
}

test("initial page is locked, including before JavaScript runs", async () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="appShell"[^>]*hidden inert/);
  assert.doesNotMatch(html, /<script[^>]*src="(?:app|report-app|report-converter)\.js"/);
  const h = await harness();
  assert.equal(h.elements.appShell.hidden, true);
  assert.equal(h.elements.appShell.inert, true);
  assert.equal(h.elements.loginView.hidden, false);
  assert.equal(h.elements.loginButton.disabled, false);
  assert.deepEqual(h.calls.scripts, []);
});

test("only the configured username is sent to Firebase", async () => {
  const h = await harness();
  await h.submit("someone-else");
  assert.deepEqual(h.calls.signIns, []);
  assert.match(h.elements.loginStatus.textContent, /Incorrect username or password/);
  assert.equal(h.elements.appShell.hidden, true);
});

test("valid sign-in verifies the server session before loading both converters", async () => {
  const h = await harness();
  await h.submit(" NBEOPS ", " exact-password ");
  assert.deepEqual(h.calls.signIns, [{ address: email, password: " exact-password " }]);
  assert.equal(h.calls.tokenChecks, 1);
  assert.equal(h.calls.scripts.length, 5);
  assert.ok(h.calls.scripts.includes("app.js"));
  assert.ok(h.calls.scripts.includes("report-app.js"));
  assert.equal(h.elements.appShell.hidden, false);
  assert.equal(h.elements.appShell.inert, false);
  assert.equal(h.elements.loginView.hidden, true);
  assert.equal(h.elements.loginPassword.value, "");
});

for (const code of ["auth/invalid-credential", "auth/too-many-requests", "auth/network-request-failed"]) {
  test(`${code} leaves converters locked and allows another attempt`, async () => {
    const h = await harness({ signInError: code });
    await h.submit();
    assert.equal(h.elements.appShell.hidden, true);
    assert.deepEqual(h.calls.scripts, []);
    assert.equal(h.elements.loginButton.disabled, false);
    assert.equal(h.elements.loginPassword.value, "");
    assert.match(h.elements.loginStatus.className, /error/);
  });
}

test("a restored session is checked online before opening the app", async () => {
  const h = await harness({ restored: true });
  assert.equal(h.calls.tokenChecks, 1);
  assert.equal(h.elements.appShell.hidden, false);
});

test("an expired or offline restored session fails closed", async () => {
  const h = await harness({ restored: true, tokenError: true });
  assert.equal(h.elements.appShell.hidden, true);
  assert.deepEqual(h.calls.scripts, []);
  assert.equal(h.calls.signOuts, 1);
});

test("another Firebase account cannot access AFMS", async () => {
  const h = await harness();
  await h.changeUser({ uid: "another-user", email, getIdToken: () => Promise.resolve("token") });
  assert.equal(h.calls.signOuts, 1);
  assert.equal(h.elements.appShell.hidden, true);
  assert.deepEqual(h.calls.scripts, []);
});

test("sign-out locks the UI and reloads to discard uploaded workbooks", async () => {
  const h = await harness({ restored: true });
  await h.elements.signOutButton.events.click();
  assert.equal(h.calls.signOuts, 1);
  assert.equal(h.elements.appShell.hidden, true);
  assert.ok(h.calls.reloads >= 1);
});

test("a session that ends during verification cannot reopen the app", async () => {
  let release;
  const tokenPromise = new Promise(resolve => { release = resolve; });
  const h = await harness({ restored: true, tokenPromise });
  await h.changeUser(null);
  release();
  await flush();
  assert.equal(h.elements.appShell.hidden, true);
  assert.deepEqual(h.calls.scripts, []);
});

for (const failure of ["importError", "storageError", "scriptError"]) {
  test(`${failure} never exposes the converters`, async () => {
    const h = await harness({ [failure]: true });
    if (failure === "scriptError") await h.submit();
    assert.equal(h.elements.appShell.hidden, true);
    assert.match(h.elements.loginStatus.className, /error/);
    if (failure !== "scriptError") assert.equal(h.elements.loginButton.formNoValidate, true);
  });
}
