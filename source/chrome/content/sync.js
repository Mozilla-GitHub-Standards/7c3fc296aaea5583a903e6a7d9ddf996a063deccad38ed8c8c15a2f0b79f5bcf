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
  this._log = Log4Moz.repository.getLogger("Window");

  let obs = [["weave:service:sync:start", "onSyncStart"],
    ["weave:service:sync:finish", "onSyncFinish"],
    ["weave:service:sync:error", "onSyncError"],
    ["weave:service:login:start", "onLoginStart"],
    ["weave:service:login:finish", "onLoginFinish"],
    ["weave:service:login:error", "onLoginError"],
    ["weave:service:logout:finish", "onLogout"],
    ["weave:notification:added", "onNotificationAdded"],
    ["weave:notification:removed", "onNotificationRemoved"]];

  // Add the observers now and remove them on unload
  let weaveWin = this;
  let addRem = function(add) obs.forEach(function([topic, func])
    Observers[add ? "add" : "remove"](topic, weaveWin[func], weaveWin));
  addRem(true);
  window.addEventListener("unload", function() addRem(false), false);

  if (Weave.Svc.Prefs.get("ui.syncnow"))
    document.getElementById("sync-syncnowitem").setAttribute("hidden", false);

  if (Weave.Svc.Prefs.get("lastversion") == "firstrun") {
    let url = "http://services.mozilla.com/firstrun/?version=" +
      Weave.WEAVE_VERSION;
    setTimeout(function() { window.openUILinkIn(url, "tab"); }, 500);
    Weave.Svc.Prefs.set("lastversion", Weave.WEAVE_VERSION);

  } else if (Weave.Svc.Prefs.get("lastversion") != Weave.WEAVE_VERSION) {
    let url = "http://services.mozilla.com/updated/?version=" +
      Weave.WEAVE_VERSION;
    setTimeout(function() { window.openUILinkIn(url, "tab"); }, 500);
    Weave.Svc.Prefs.set("lastversion", Weave.WEAVE_VERSION);
  }

  // TODO: This is a fix for the general case of bug 436936.  It will
  // not support marginal cases such as when a new browser window is
  // opened in the middle of signing-in or syncing.
  if (Weave.Service.isLoggedIn)
    this.onLoginFinish();
  else
    this._setStatus("offline");

  Weave.Service.onWindowOpened();
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

  _setStatus: function WeaveWin_setStatus(status) {
    let label;
    if (status == "offline")
      label = this._stringBundle.getString("status.offline");
    else {
      if (!Weave.Service.username) {
        this._log.error("status is " + status + ", but username not set");
        // Fall back to a generic string.
        label = this._stringBundle.getString("status." + status);
      }
      else
        label = Weave.Service.username;
    }

    let button = document.getElementById("sync-menu-button");
    button.setAttribute("label", label);
    button.setAttribute("image", "chrome://weave/skin/" + (status == "active" ?
      "sync-throbber-16x16-active.apng" : "sync-16x16.png"));
  },

  onLoginStart: function WeaveWin_onLoginStart() {
    this._log.info("Logging in...");
    this._setStatus("active");
  },

  onLoginError: function WeaveWin_onLoginError() {
    this._log.info("Login Error");
    this._setStatus("offline");

    let title = this._stringBundle.getString("error.login.title");
    let reason = this._stringBundle.getString("error.login.reason.unknown");
    let description =
      this._stringBundle.getFormattedString("error.login.description", [reason]);
    let notification = new Weave.Notification(title, description, null,
					      Weave.Notifications.PRIORITY_WARNING);
    Weave.Notifications.replaceTitle(notification);
  },

  onLoginFinish: function WeaveWin_onLoginFinish() {
    this._log.info("Login successful");
    this._setStatus("idle");

    // Clear out any login failure notifications
    let title = this._stringBundle.getString("error.login.title");
    Weave.Notifications.removeAll(title);

    let loginitem = document.getElementById("sync-loginitem");
    let logoutitem = document.getElementById("sync-logoutitem");
    if(loginitem && logoutitem) {
      loginitem.setAttribute("hidden", "true");
      logoutitem.setAttribute("hidden", "false");
    }

    let syncnowitem = document.getElementById("sync-syncnowitem");
    if (syncnowitem)
      syncnowitem.setAttribute("disabled", "false");
  },

  onLogout: function WeaveWin_onLogout() {
    this._setStatus("offline");

    let loginitem = document.getElementById("sync-loginitem");
    let logoutitem = document.getElementById("sync-logoutitem");
    if(loginitem && logoutitem) {
      loginitem.setAttribute("hidden", "false");
      logoutitem.setAttribute("hidden", "true");
    }

    let syncnowitem = document.getElementById("sync-syncnowitem");
    if (syncnowitem)
      syncnowitem.setAttribute("disabled", "true");
  },

  _onGetPassword: function WeaveWin_onGetPassword(identity) {
    let self = yield;
    this._log.info("getting password...");
    self.done();
  },

  _onGetPassphrase: function WeaveWin_onGetPassphrase(identity) {
    let self = yield;
    this._log.info("getting passphrase...");
//    Weave.Utils.openLogin();
    self.done();
  },

  onSyncStart: function WeaveWin_onSyncStart() {
    this._setStatus("active");

    let syncitem = document.getElementById("sync-syncnowitem");
    if(syncitem)
      syncitem.setAttribute("disabled", "true");

    let logoutitem = document.getElementById("sync-logoutitem");
    if(logoutitem)
      logoutitem.setAttribute("disabled", "true");
  },

  _onSyncEnd: function WeaveWin__onSyncEnd(status) {
    this._setStatus("idle");

    let title = this._stringBundle.getString("error.sync.title");
    if (!status) {
      let description = this._stringBundle.getString("error.sync.description");
      let tryAgainButton =
        new Weave.NotificationButton(
          this._stringBundle.getString("error.sync.tryAgainButton.label"),
          this._stringBundle.getString("error.sync.tryAgainButton.accesskey"),
          function() { gWeaveWin.doSync(); return true; }
        );
      let notification =
        new Weave.Notification(
          title,
          description,
          null,
          Weave.Notifications.PRIORITY_WARNING,
          [tryAgainButton]
        );
      Weave.Notifications.replaceTitle(notification);
    }
    // Clear out sync failures on a successful sync
    else
      Weave.Notifications.removeAll(title);

    let syncitem = document.getElementById("sync-syncnowitem");
    if (syncitem)
      syncitem.setAttribute("disabled", "false");

    let logoutitem = document.getElementById("sync-logoutitem");
    if(logoutitem)
      logoutitem.setAttribute("disabled", "false");

    this._updateLastSyncItem();
  },

  onSyncFinish: function WeaveWin_onSyncFinish(subject, data) {
    this._onSyncEnd(true);
  },

  onSyncError: function WeaveWin_onSyncError(subject, data) {
    this._onSyncEnd(false);
  },

  shutDown: function WeaveWin_shutDown(event) {},

  doLoginPopup : function WeaveWin_doLoginPopup(event) {
    Weave.Utils.openLogin();
  },

  doLogin: function WeaveWin_doLogin(event) {
    if (Weave.Service.isLoggedIn)
      return;

    let username = Weave.Svc.Prefs.get("username");
    let server = Weave.Svc.Prefs.get("serverURL");
    if (!username && server == 'https://auth.services.mozilla.com/')
      this.doOpenSetupWizard();
    else
      this.doLoginPopup();
  },

  doOpenSetupWizard : function WeaveWin_doOpenSetupWizard(event) {
    Weave.Utils.openWizard();
  },

  doLogout: function WeaveWin_doLogout(event) {
    Weave.Service.logout();
  },

  doSync: function WeaveWin_doSync(event) {
    Weave.Utils.openStatus();
  },

  doShare: function WeaveWin_doShare(event) {
    Weave.Utils.openShare();
  },

  doCancelSync: function WeaveWin_doCancelSync(event) {
    this._log.error("cancel sync unimplemented");
  },

  doOpenPrefs: function WeaveWin_doOpenPrefs(event) {
    let pane = "sync-prefpane";
    switch (Weave.Svc.AppInfo.ID) {
      case Weave.FIREFOX_ID:
        openPreferences(pane);
        break;

      case Weave.SEAMONKEY_ID:
        goPreferences(pane);
        break;

      case Weave.THUNDERBIRD_ID:
        openOptionsDialog(pane);
        break;
    }
  },

  onOpenPrefs : function WeaveWin_onOpenPrefs(event) {
    // XXX called when prefpane opens, setup password and login states
  },

  doOpenActivityLog: function WeaveWin_doOpenActivityLog(event) {
    Weave.Utils.openLog();
  },

  doPopup: function WeaveWin_doPopup(event) {
    this._updateLastSyncItem();
  },

  onNotificationAdded: function WeaveWin_onNotificationAdded() {
    document.getElementById("sync-notifications-button").hidden = false;
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

    let lastSyncDate = new Date(lastSync).toLocaleString();
    let lastSyncLabel =
      this._stringBundle.getFormattedString("lastSync.label", [lastSyncDate]);
    lastSyncItem.setAttribute("label", lastSyncLabel);
    lastSyncItem.setAttribute("hidden", "false");
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
    var menuPopup = document.getElementById('sync-menu-popup');
    var menuButton = document.getElementById("sync-menu-button");

    // If the menu popup isn't on the menu button, then move the popup onto
    // the button so the popup appears when the user clicks the button.  We'll
    // move the popup back to the Tools > Sync menu when the popup hides.
    if (menuPopup.parentNode != menuButton)
      menuButton.appendChild(menuPopup);

    menuPopup.openPopup(menuButton, "before_start", 0, 0, true);
  }
};

let gWeaveWin;

window.addEventListener("load", function(e) { gWeaveWin = new WeaveWindow(); }, false);
window.addEventListener("unload", function(e) { gWeaveWin.shutDown(e); }, false);