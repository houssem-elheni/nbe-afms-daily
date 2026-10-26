(function () {
  "use strict";

  const ACCOUNT = Object.freeze({
    username: "nbeops",
    email: "nbeops@nbe-afms.local",
    uid: "CVWWBPx3ECQDroNRmN1NQ3kIFau2"
  });
  const FIREBASE_CONFIG = Object.freeze({
    apiKey: "AIzaSyANWmbBlyksknG8_sv_fHZBxqY-VCTFyXY",
    authDomain: "dtnh-roster-engine.firebaseapp.com",
    projectId: "dtnh-roster-engine",
    appId: "1:390573544321:web:294111991e5c5e66e64e80"
  });
  const el = Object.fromEntries([
    "loginView", "loginForm", "loginUsername", "loginPassword", "loginButton",
    "loginStatus", "appShell", "signOutButton"
  ].map(id => [id, document.getElementById(id)]));
  let auth;
  let sdk;
  let initializing = false;
  let ready = false;
  let revision = 0;
  let appLoaded = false;
  let appLoading;
  let loginMessage = "";

  function isAllowed(user) {
    return user?.uid === ACCOUNT.uid && user.email === ACCOUNT.email;
  }

  function message(text, error = false) {
    el.loginStatus.textContent = text;
    el.loginStatus.className = `login-status${error ? " error" : ""}`;
  }

  function lock() {
    el.appShell.hidden = true;
    el.appShell.inert = true;
    el.loginView.hidden = false;
  }

  function showLogin() {
    lock();
    el.loginPassword.value = "";
    el.loginButton.disabled = false;
    el.loginButton.textContent = ready ? "Sign in" : "Retry connection";
    el.loginButton.formNoValidate = !ready;
    message(loginMessage, Boolean(loginMessage));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error("app-load-failed"));
      };
      document.head.appendChild(script);
    });
  }

  function loadConverters() {
    if (!appLoading) {
      appLoading = (async () => {
        for (const src of [
          "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
          "shared/afms-flight-program.js", "app.js", "report-converter.js", "report-app.js"
        ]) await loadScript(src);
        appLoaded = true;
      })();
    }
    return appLoading;
  }

  async function authChanged(user) {
    const currentRevision = ++revision;
    lock();
    if (!user) {
      // Discard uploaded workbooks and pending conversions when a session ends.
      if (appLoaded) { window.location.reload(); return; }
      showLogin();
      return;
    }
    if (!isAllowed(user)) {
      loginMessage = "This account cannot access AFMS.";
      await sdk.signOut(auth);
      return;
    }
    el.loginButton.disabled = true;
    message("Checking sign-in...");
    try {
      // Validate restored sessions with Firebase before loading either converter.
      await user.getIdToken(true);
      if (currentRevision !== revision || !isAllowed(auth.currentUser)) return;
      message("Opening AFMS...");
      await loadConverters();
      if (currentRevision !== revision || !isAllowed(auth.currentUser)) return;
      el.loginPassword.value = "";
      el.loginView.hidden = true;
      el.appShell.inert = false;
      el.appShell.hidden = false;
      el.signOutButton.disabled = false;
      document.getElementById("dailyTab").focus();
    } catch (error) {
      if (currentRevision !== revision) return;
      loginMessage = error.message === "app-load-failed"
        ? "AFMS could not load. Refresh the page to try again."
        : "Your session could not be verified. Please sign in again.";
      await sdk.signOut(auth);
      showLogin();
    }
  }

  async function initialize() {
    if (initializing || ready) return;
    initializing = true;
    el.loginButton.disabled = true;
    message("Connecting...");
    try {
      const [firebase, authSdk] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js")
      ]);
      sdk = authSdk;
      const app = firebase.getApps().find(item => item.name === "nbe-afms") || firebase.initializeApp(FIREBASE_CONFIG, "nbe-afms");
      auth = sdk.getAuth(app);
      await sdk.setPersistence(auth, sdk.browserSessionPersistence);
      ready = true;
      sdk.onAuthStateChanged(auth, authChanged);
    } catch (_) {
      loginMessage = "Cannot connect to sign-in. Check your connection and retry.";
      showLogin();
    } finally {
      initializing = false;
    }
  }

  el.loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!ready) { await initialize(); return; }
    if (el.loginButton.disabled) return;
    loginMessage = "";
    if (el.loginUsername.value.trim().toLowerCase() !== ACCOUNT.username) {
      loginMessage = "Incorrect username or password.";
      showLogin();
      el.loginUsername.focus();
      return;
    }
    el.loginButton.disabled = true;
    message("Signing in...");
    try {
      await sdk.signInWithEmailAndPassword(auth, ACCOUNT.email, el.loginPassword.value);
    } catch (error) {
      loginMessage = error.code === "auth/too-many-requests"
        ? "Too many attempts. Please try again later."
        : error.code === "auth/network-request-failed"
          ? "Cannot connect to sign-in. Check your connection and retry."
          : "Incorrect username or password.";
      showLogin();
      el.loginPassword.focus();
    }
  });

  el.signOutButton.addEventListener("click", async () => {
    el.signOutButton.disabled = true;
    lock();
    try {
      await sdk.signOut(auth);
      window.location.reload();
    } catch (_) {
      loginMessage = "Could not sign out. Close this tab to end the session.";
      showLogin();
    }
  });

  initialize();
})();
