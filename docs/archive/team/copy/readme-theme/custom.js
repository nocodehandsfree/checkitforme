/* Check theme for ReadMe: put the FULL page list in the mobile
   slide-out menu (owner 2026-07-10: "the slide-out should show
   every single page"). Clones the desktop sidebar (which already
   holds every category + page) into the flyout drawer.
   Paste into ReadMe dashboard: Appearance → Custom Code → JavaScript. */
(function () {
  function inject() {
    try {
      var fly = document.querySelector('.rm-Flyout > div, [data-testid="flyout"] > div');
      if (!fly || fly.querySelector('.check-flyout-nav')) return;
      var sidebar = document.querySelector('.rm-Sidebar');
      if (!sidebar) return;
      var clone = sidebar.cloneNode(true);
      clone.className = 'check-flyout-nav';
      fly.appendChild(clone);
    } catch (e) { /* never break the page over nav sugar */ }
  }
  new MutationObserver(inject).observe(document.body, { subtree: true, childList: true });
  inject();
})();
