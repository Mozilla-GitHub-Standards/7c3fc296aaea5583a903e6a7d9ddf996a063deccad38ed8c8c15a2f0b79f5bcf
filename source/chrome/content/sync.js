/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Bookmarks Sync.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Dan Mills <thunder@mozilla.com>
 *  Chris Beard <cbeard@mozilla.com>
 *  Dan Mosedale <dmose@mozilla.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

if (typeof(Cc) == "undefined")
  var Cc = Components.classes;
if (typeof(Ci) == "undefined")
  var Ci = Components.interfaces;
if (typeof Cu == "undefined")
  var Cu = Components.utils;
if (typeof Cr == "undefined")
  var Cr = Components.results;

function WeaveWindow() {
  if (window.location.href != getBrowserURL())
    return;

  let obs = [["weave:service:sync:start", "onSyncStart"],
    ["weave:service:sync:finish", "onSyncFinish"],
    ["weave:service:sync:error", "onSyncError"],
    ["weave:service:sync:delayed", "onSyncDelay"],
    ["weave:service:setup-complete", "onLoginFinish"],
    ["weave:engine:sync:start",  "onEngineStart"],
    ["weave:service:verify-login:start", "onLoginStart"],
    ["weave:service:login:finish", "onLoginFinish"],
    ["weave:service:login:error", "onLoginError"],
    ["weave:service:logout:finish", "onLogout"],
    ["private-browsing", "onPrivateBrowsingChange"],
    ["weave:notification:added", "onNotificationAdded"],
    ["weave:notification:removed", "onNotificationRemoved"]];

  // Add the observers now and remove them on unload
  let weaveWin = this;
  let addRem = function(add) obs.forEach(function([topic, func])
    Weave.Svc.Obs[add ? "add" : "remove"](topic, weaveWin[func], weaveWin));
  addRem(true);
  window.addEventListener("unload", function() addRem(false), false);

  if (Weave.Svc.Prefs.get("lastversion") == "firstrun") {
    setTimeout(this.openSetup, 500);
    Weave.Svc.Prefs.set("lastversion", Weave.WEAVE_VERSION);

  } else if (Weave.Svc.Prefs.get("lastversion") != Weave.WEAVE_VERSION) {
    setTimeout(function() window.openUILinkIn(Weave.Service.updatedURL, "tab"), 500);
    Weave.Svc.Prefs.set("lastversion", Weave.WEAVE_VERSION);
  }

  // TODO: This is a fix for the general case of bug 436936.  It will
  // not support marginal cases such as when a new browser window is
  // opened in the middle of signing-in or syncing.
  if (Weave.Svc.Private.privateBrowsingEnabled)
    this._setStatus("privateBrowsing");
  else if (Weave.Service.isLoggedIn)
    this.onLoginFinish();
  else if (this._needsSetup())
    this._setStatus("needsSetup");
  else
    this._setStatus("offline");

  // Only show the activity log for dev-channel releases
  if (Weave.WEAVE_CHANNEL == "dev")
    document.getElementById("sync-openlogitem").hidden = false;
}
WeaveWindow.prototype = {
  get _isTopBrowserWindow() {
    // TODO: This code is mostly just a workaround that ensures that only one
    // browser window ever performs any actions that are meant to only
    // be performed once in response to a weave event.  Ideally, such code
    // should not be handled by browser windows, but instead by e.g. actual
    // singleton services.
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow("navigator:browser");
    return (win == window);
  },

  get _stringBundle() {
    let stringBundle = document.getElementById("weaveStringBundle");
    this.__defineGetter__("_stringBundle",
                          function() { return stringBundle; });
    return this._stringBundle;
  },

  _needsSetup: function() {
    return Weave.Status.service == Weave.CLIENT_NOT_CONFIGURED ||
           Weave.Svc.Prefs.get("firstSync", "") == "notReady";
  },

  _setStatus: function WeaveWin_setStatus(status) {
    let label;
    switch (status) {
      case "offline":
        label = this._stringBundle.getString("status.offline");
        break;
      case "privateBrowsing":
        label = this._stringBundle.getString("status.privateBrowsing");
        break;
      case "needsSetup":
        label = this._stringBundle.getString("status.needsSetup");
        break;
      default:
        label = Weave.Service.username;
    }

    let button = document.getElementById("sync-menu-button");
    button.setAttribute("label", label);
    button.setAttribute("image", "chrome://weave/skin/" + (status == "active" ?
      "sync-throbber-16x16-active.apng" : "sync-16x16.png"));
  },

  onLoginStart: function WeaveWin_onLoginStart() {
    this._setStatus("active");
  },

  onLoginError: function WeaveWin_onLoginError() {
    // if login fails, any other notifications are essentially moot
    Weave.Notifications.removeAll();

    // if we haven't set up the client, don't show errors
    if (this._needsSetup()) {
      this._setStatus("needsSetup");
      return;
    }

    this._setStatus("offline");

    let title = this._stringBundle.getString("error.login.title");
    let reason = Weave.Utils.getErrorString(Weave.Status.login);
    let description =
      this._stringBundle.getFormattedString("error.login.description", [reason]);
    let buttons = [];
    buttons.push(new Weave.NotificationButton(
      this._stringBundle.getString("error.login.prefs.label"),
      this._stringBundle.getString("error.login.prefs.accesskey"),
      function() { gWeaveWin.openPrefs(); return true; }
    ));

    let notification = new Weave.Notification(title, description, null,
                                              Weave.Notifications.PRIORITY_WARNING, buttons);
    Weave.Notifications.replaceTitle(notification);
  },

  onLoginFinish: function WeaveWin_onLoginFinish() {
    if (this._needsSetup())
      this._setStatus("needsSetup");
    else
      this._setStatus("idle");

    // Clear out any login failure notifications
    let title = this._stringBundle.getString("error.login.title");
    Weave.Notifications.removeAll(title);
  },

  onLogout: function WeaveWin_onLogout() {
    if (this._needsSetup())
      this._setStatus("needsSetup");
    else
      this._setStatus("offline");
  },

  onPrivateBrowsingChange: function WeaveWin_onPrivateBrowsingChange(subject, data) {
    if (data == "enter")
      this._setStatus("privateBrowsing");
    else if (Weave.Service.isLoggedIn)
      this._setStatus("idle");
    else if (this._needsSetup())
      this._setStatus("needsSetup");
    else
      this._setStatus("offline");
  },

  _allowSBUpdates: false,
  onSyncStart: function WeaveWin_onSyncStart() {
    this._setStatus("active");
    this._allowSBUpdates = true;
  },

  _onSyncEnd: function WeaveWin__onSyncEnd(status) {
    this._allowSBUpdates = false;
    this._setStatus("idle");

    let title = this._stringBundle.getString("error.sync.title");
    if (!status) {
      let error = Weave.Utils.getErrorString(Weave.Status.sync);
      let description = this._stringBundle
                            .getFormattedString("error.sync.description", [error]);

      let priority = Weave.Notifications.PRIORITY_WARNING;
      let buttons = [];

      // Check if the client is outdated in some way
      let outdated = Weave.Status.sync == Weave.VERSION_OUT_OF_DATE;
      for (let [engine, reason] in Iterator(Weave.Status.engines))
        outdated = outdated || reason == Weave.VERSION_OUT_OF_DATE;

      if (outdated) {
        description = Weave.Str.sync.get("error.sync.needUpdate.description");
        let label = Weave.Str.sync.get("error.sync.needUpdate.label");
        let accesskey = Weave.Str.sync.get("error.sync.needUpdate.accesskey");
        buttons.push(new Weave.NotificationButton(label, accesskey, function() {
          let theEM = Weave.Svc.WinMediator.getMostRecentWindow("Extension:Manager");
          if (theEM != null) {
            theEM.focus();
            theEM.showView("extensions");
          }
          else {
            const EMURL = "chrome://mozapps/content/extensions/extensions.xul";
            const EMFEATURES = "chrome,menubar,extra-chrome,toolbar,dialog=no,resizable";
            window.openDialog(EMURL, "", EMFEATURES, "extensions");
          }
          return true;
        }));
      }
      else if (!Weave.Status.enforceBackoff) {
        priority = Weave.Notifications.PRIORITY_INFO;
        buttons.push(new Weave.NotificationButton(
          this._stringBundle.getString("error.sync.tryAgainButton.label"),
          this._stringBundle.getString("error.sync.tryAgainButton.accesskey"),
          function() { gWeaveWin.doSync(); return true; }
        ));
      }

      let notification =
        new Weave.Notification(title, description, null, priority, buttons);
      Weave.Notifications.replaceTitle(notification);
    }
    // Clear out sync failures on a successful sync
    else
      Weave.Notifications.removeAll(title);

    if (this._wasDelayed && Weave.Status.sync != Weave.NO_SYNC_NODE_FOUND) {
      title = this._stringBundle.getString("error.sync.no_node_found.title");
      Weave.Notifications.removeAll(title);
      this._wasDelayed = false;
    }

    this._updateLastSyncItem();
  },

  onSyncFinish: function WeaveWin_onSyncFinish(subject, data) {
    this._onSyncEnd(true);
  },

  onSyncError: function WeaveWin_onSyncError(subject, data) {
    this._onSyncEnd(false);
  },

  onSyncDelay: function WeaveWin_onSyncDelay(subject, data) {
    // basically, we want to just inform users that stuff is going to take a while
    let title = this._stringBundle.getString("error.sync.no_node_found.title");
    let description = this._stringBundle.getString("error.sync.no_node_found");
    let notification = new Weave.Notification(title, description, null, Weave.Notifications.PRIORITY_INFO);
    Weave.Notifications.replaceTitle(notification);
    this._wasDelayed = true;
  },

  onEngineStart: function WeaveWin_onEngineStart(subject, data) {
    if (!this._allowSBUpdates)
      return;

    let engine = subject == "clients" ? Weave.Clients : Weave.Engines.get(subject);
    let engineName = engine.displayName;
    let label = this._stringBundle.getFormattedString("syncing.label", [engineName]);
    let button = document.getElementById("sync-menu-button");
    button.setAttribute("label", label);
  },

  openPrefs: function openPrefs() {
    let pane = "paneWeaveServices";
    switch (Weave.Svc.AppInfo.ID) {
      case Weave.FIREFOX_ID:
        openPreferences(pane);
        break;

      case Weave.SEAMONKEY_ID:
        goPreferences(pane);
        break;
    }
  },

  openSetup: function openSetup() {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow("Weave:AccountSetup");
    if (win)
      win.focus();
    else {
      window.openDialog("chrome://weave/content/preferences/fx-setup.xul",
                        "weaveSetup", "centerscreen,chrome,resizable=no");
    }
  },

  doLogin: function WeaveWin_doLogout(event) {
    setTimeout(function() Weave.Service.login(), 0);
  },

  doLogout: function WeaveWin_doLogout(event) {
    setTimeout(function() Weave.Service.logout(), 0);
  },

  doSync: function WeaveWin_doSync(event) {
    setTimeout(function() Weave.Service.sync(), 0);
  },

  doOpenActivityLog: function WeaveWin_doOpenActivityLog(event) {
    window.openUILinkIn("about:sync-log", "tab");
  },

  doPopup: function WeaveWin_doPopup(event) {
    this._updateLastSyncItem();

    let loginItem = document.getElementById("sync-loginitem");
    let logoutItem = document.getElementById("sync-logoutitem");
    let syncItem = document.getElementById("sync-syncnowitem");

    // Don't allow "login" to be selected in some cases
    let offline = Weave.Svc.IO.offline;
    let locked = Weave.Service.locked;
    let pbEnabled = Weave.Svc.Private.privateBrowsingEnabled;
    let noUser = Weave.Service.username == "";
    let notReady = offline || locked || pbEnabled || noUser;
    loginItem.setAttribute("disabled", notReady);
    logoutItem.setAttribute("disabled", notReady);

    // Don't allow "sync now" to be selected in some cases
    let loggedIn = Weave.Service.isLoggedIn;
    let noNode = Weave.Status.sync == Weave.NO_SYNC_NODE_FOUND;
    let disableSync = notReady || !loggedIn || noNode || pbEnabled;
    syncItem.setAttribute("disabled", disableSync);

    // Only show one of login/logout
    loginItem.setAttribute("hidden", loggedIn);
    logoutItem.setAttribute("hidden", !loggedIn);
  },

  onNotificationAdded: function WeaveWin_onNotificationAdded() {
    document.getElementById("sync-notifications-button").hidden = false;
    let notifications = Weave.Notifications.notifications;
    let priority = 0;
    for (let i = 0;i < notifications.length;i++)
      priority = Math.max(notifications[i].priority, priority);

    let image = priority >= Weave.Notifications.PRIORITY_WARNING ?
                "chrome://global/skin/icons/warning-16.png" :
                "chrome://global/skin/icons/information-16.png";
    document.getElementById("sync-notifications-button").image = image;
  },

  onNotificationRemoved: function WeaveWin_onNotificationRemoved() {
    if (Weave.Notifications.notifications.length == 0)
      document.getElementById("sync-notifications-button").hidden = true;
  },

  _updateLastSyncItem: function WeaveWin__updateLastSyncItem() {
    let lastSync = Weave.Svc.Prefs.get("lastSync");
    if (!lastSync)
      return;

    let lastSyncItem = document.getElementById("sync-lastsyncitem");
    if (!lastSyncItem)
      return;

    // Show the day-of-week and time (HH:MM) of last sync
    let lastSyncDate = new Date(lastSync).toLocaleFormat("%a %H:%M");
    let lastSyncLabel =
      this._stringBundle.getFormattedString("lastSync.label", [lastSyncDate]);
    lastSyncItem.setAttribute("label", lastSyncLabel);
    lastSyncItem.setAttribute("hidden", "false");
    document.getElementById("sync-lastsyncsep").hidden = false;
  },

  onMenuPopupHiding: function WeaveWin_onMenuPopupHiding() {
    var menuPopup = document.getElementById('sync-menu-popup');
    var menu = document.getElementById('sync-menu');

    // If the menu popup isn't on the Tools > Sync menu, then move the popup
    // back onto that menu so the popup appears when the user selects the menu.
    // We'll move the popup back to the menu button when the user clicks on
    // the menu button.
    if (menuPopup.parentNode != menu)
      menu.appendChild(menuPopup);
  },

  onMenuButtonMouseDown: function WeaveWin_onMenuButtonMouseDown() {
    // Don't show the menu here if we need to setup. We want the click action to
    // just open the pref pane. The menu will still be accesible in the Tools menu.
    if (this._needsSetup())
      return;

    var menuPopup = document.getElementById('sync-menu-popup');
    var menuButton = document.getElementById("sync-menu-button");

    // If the menu popup isn't on the menu button, then move the popup onto
    // the button so the popup appears when the user clicks the button.  We'll
    // move the popup back to the Tools > Sync menu when the popup hides.
    if (menuPopup.parentNode != menuButton)
      menuButton.appendChild(menuPopup);

    menuPopup.openPopup(menuButton, "before_start", 0, 0, true);
  },

  onMenuButtonCommand: function WeaveWin_onMenuButtonCommand(event) {
    if (this._needsSetup())
      this.openSetup();
  }
};

let gWeaveWin;

window.addEventListener("load", function(e) { gWeaveWin = new WeaveWindow(); }, false);
