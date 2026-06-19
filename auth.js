// Password gate — runs immediately on every protected page.
// The hash lives in localStorage; sessionStorage tracks this browser session.
(function () {
  var LOGIN   = "login.html";
  var HASH_KEY = "epiwen_pass_hash";
  var AUTH_KEY = "epiwen_authed";

  // Skip the gate on the login page itself
  if (window.location.pathname.split("/").pop() === LOGIN) return;

  function redirect() {
    window.location.replace(LOGIN + "?r=" + encodeURIComponent(window.location.href));
  }

  var stored = localStorage.getItem(HASH_KEY);
  if (!stored) { redirect(); return; }                       // not yet configured
  if (sessionStorage.getItem(AUTH_KEY) !== stored) { redirect(); return; }
})();

// Global sign-out helper — available on every protected page.
window.EpiAuth = {
  signOut: function () {
    sessionStorage.removeItem("epiwen_authed");
    window.location.href = "login.html";
  }
};
