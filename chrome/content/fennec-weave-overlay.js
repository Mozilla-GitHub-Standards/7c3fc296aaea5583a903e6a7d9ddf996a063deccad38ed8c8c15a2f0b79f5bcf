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
 * The Original Code is Bookmarks sync code.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Jono DiCarlo <jdicarlo@mozilla.com>
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

function FennecWeaveGlue() {
  // Log4Moz works on fennec?
  this._log = Log4Moz.repository.getLogger("Chrome.Window");
  this._log.info("Initializing Fennec Weave embedding");

  try {
    //Cu.import("resource://weave/engines/bookmarks.js");
    Cu.import("resource://weave/engines/history.js");

    Weave.Engines.register(new HistoryEngine());
    //Weave.Engines.register(new BookmarksEngine());
  } catch (e) {
    this._log.error("Could not initialize engine: " + (e.message? e.message : e));
  }
}
FennecWeaveGlue.prototype = {
  shutdown: function FennecWeaveGlue__shutdown() {
    // Anything that needs shutting down can go here.
  },

  /* TODO getting errors like this:
   * 2008-12-10 11:41:55	Service.Main	WARN	Could not get encryption passphrase
   * Which means that the timer is set up and weave is actually trying to
   * connect; need to make sure that we put the password/passphrase in the
   * right place!!  Ah yes that's right, it goes in ID.get('WeaveCryptoID')
   * Try doing Weave.Service.username = , .password=, .passphrase = .
   */

  // TODO probably also want a Sync Now button, just for testing/dev.

  openPrefs: function FennecWeaveGlue__openPrefs() {
    /*var ios = Cc["@mozilla.org/network/io-service;1"]
      .getService(Ci.nsIIOService);
    var uri = ios.newURI("chrome://weave/content/fennec-connect.html");*/

    var prefService = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefBranch);
    var serverUrl = prefService.getCharPref("extensions.weave.serverURL");
    dump("Server URL is " + serverUrl + "\n");
    var username = prefService.getCharPref("extensions.weave.username");
    dump("Username is " + username + "\n");
    // Try this... password and passphrase will be stored in the password
    // manager and accessible through Weave.Service getters and setters...
    var password = Weave.Service.password;
    dump("Password is " + password + "\n");
    var passphrase = Weave.Service.passphrase;
    dump("Passphrase is " + passphrase + "\n");

    if (username && password && passphrase && username != "nobody") {
      Browser.currentBrowser.loadURI("chrome://weave/content/fennec-prefs.html");
    } else {
      Browser.currentBrowser.loadURI("chrome://weave/content/fennec-connect.html");
    }

    /*Also: defaults for prefs being different on fennec than on ffox?
       E.G. rememberpassword default to true, syncOnQuit default to false
       (but syncOnStart default to true...)  Pref defaults can be set
     programmatically (not affecting the actual current setting)
     with something like:
     defaults = this._prefSvc.getDefaultBranch(null);
     defaults.setCharPref(name, val);*/

 /* This gets an error like:
    Error: uncaught exception: [Exception... "Component returned failure code: 0x80070057 (NS_ERROR_ILLEGAL_VALUE) [nsIIOService.newURI]"  nsresult: "0x80070057 (NS_ERROR_ILLEGAL_VALUE)"  location: "JS frame :: chrome://browser/content/browser-ui.js :: anonymous :: line 155"  data: no]
    Possibly because 'weave' isn't a registered chrome package. */
  }
};


let gFennecWeaveGlue;
window.addEventListener("load", function(e) {
			  gFennecWeaveGlue = new FennecWeaveGlue();
			}, false );
window.addEventListener("unload", function(e) {
			  gFennecWeaveGlue.shutdown(e);
			}, false );