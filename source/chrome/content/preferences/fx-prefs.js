let gWeavePane = {
  get _usingMainServers() {
    return document.getElementById("serverType").selectedItem.value == "main";
  },

  get bundle() {
    delete this.bundle;
    return this.bundle = document.getElementById("weavePrefStrings");
  },

  get page() {
    return document.getElementById("weavePrefsDeck").selectedIndex;
  },

  set page(val) {
    document.getElementById("weavePrefsDeck").selectedIndex = val;
  },

  get prefArray() {
    let prefs = ["engine.bookmarks",
                 "engine.passwords",
                 "engine.prefs",
                 "engine.history"];
    if (Weave.Service.numClients == 1)
      prefs.push("tabs.backup");
    else
      prefs.push("engine.tabs");

    return prefs;
  },

  onLoginStart: function () {
    switch (this.page) {
      case "0":
        document.getElementById("signInFeedbackBox").hidden = false;
        break;
      case "1":
        let box = document.getElementById("passphraseFeedbackBox");
        this._setFeedbackMessage(box, true);
        box.hidden = false;
        document.getElementById("passphrase-throbber").hidden = false;
        break;
      case "4":
        document.getElementById("connect-throbber").hidden = false;
        break;
    }
  },

  onLoginError: function () {
    let errorString = Weave.Utils.getErrorString(Weave.Status.login);
    let feedback = null;

    switch (this.page) {
      case "0":
        document.getElementById("signInFeedbackBox").hidden = true;
        feedback = document.getElementById("passwordFeedbackRow");

        // Move on to the passphrase page if that's the only failure
        if (Weave.Status.login == Weave.LOGIN_FAILED_INVALID_PASSPHRASE) {
          this.page = 1;
          return;
        }
        break;
      case "1":
        document.getElementById("passphrase-throbber").hidden = true;
        switch (Weave.Status.login) {
          case Weave.LOGIN_FAILED_LOGIN_REJECTED:
            feedback = document.getElementById("passwordFeedbackRow");
            this.page = 0;
            break;
          default:
            feedback = document.getElementById("passphraseFeedbackBox");
            document.getElementById("passphraseHelpBox").hidden = false;
            break;
        }
        break;
      case "4":
        document.getElementById("connect-throbber").hidden = true;
        feedback = document.getElementById("loginFeedbackRow");
        break;
    }
    this._setFeedbackMessage(feedback, false, errorString);
  },

  onLoginFinish: function () {
    document.getElementById("passphrase-throbber").hidden = true;
    document.getElementById("connect-throbber").hidden = true;
    document.getElementById("signInFeedbackBox").hidden = true;
    Weave.Service.persistLogin();
    this._setFeedbackMessage(document.getElementById("loginFeedbackRow"), true);
    this._setFeedbackMessage(document.getElementById("passphraseFeedbackBox"), true);
    this._setFeedbackMessage(document.getElementById("passwordFeedbackRow"), true);
    document.getElementById("weaveUsername").reset();
    document.getElementById("weavePassword").reset();
    document.getElementById("weavePassphrase").reset();
    document.getElementById("weaveServerURL").reset();
    this.updateWeavePrefs();
  },

  onPBModeChange: function () {
    this.updateConnectButton();
    this.updateSetupButtons();
    this.checkFields();
  },

  initWeavePrefs: function () {
    let obs = [
      ["weave:service:login:start",   "onLoginStart"],
      ["weave:service:login:error",   "onLoginError"],
      ["weave:service:login:finish",  "onLoginFinish"],
      ["private-browsing",            "onPBModeChange"],
      ["weave:service:logout:finish", "updateWeavePrefs"]];

    // Add the observers now and remove them on unload
    let weavePrefs = this;
    let addRem = function(add) obs.forEach(function([topic, func])
      Observers[add ? "add" : "remove"](topic, weavePrefs[func], weavePrefs));
    addRem(true);
    window.addEventListener("unload", function() addRem(false), false);

    this.updateWeavePrefs();
  },

  updateWeavePrefs: function () {
    if (Weave.Service.username &&
        Weave.Svc.Prefs.get("firstSync", "") == "notReady") {
      this.page = 2;
    }
    else if (Weave.Service.username) {
      this.page = 4;
      document.getElementById("currentUser").value = Weave.Service.username;
    }
    else {
      this.page = 0;
    }

    this.updateConnectButton();
    this.updateSetupButtons();
    
    this.updateTabPref();
    let syncEverything = this._checkDefaultValues();
    document.getElementById("weaveSyncMode").selectedIndex = syncEverything ? 0 : 1;
    document.getElementById("syncModeOptions").selectedIndex = syncEverything ? 0 : 1;
    this.checkFields();
  },

  updateTabPref: function () {
    let singleClient = Weave.Service.numClients == 1;
    let pref = singleClient ? "tabs.backup" : "engine.tabs";
    document.getElementById("tabPref").setAttribute("preference", pref);
    document.getElementById("tabPref").setAttribute("checked", document.getElementById(pref).value);
  },

  onServerChange: function () {
    document.getElementById("serverRow").hidden = this._usingMainServers;
    this.checkFields();
  },

  updateSetupButtons: function () {
    let elems = ["weaveUsername", "weaveUsernameLabel",
                 "weavePassword", "weavePasswordLabel",
                 "weaveServerURL", "weaveServerURLLabel",
                 "signInButton", "createAccountButton", "serverType"]
    let pbEnabled = Weave.Svc.Private.privateBrowsingEnabled;
    for (let i = 0;i < elems.length;i++)
      document.getElementById(elems[i]).disabled = pbEnabled;
  },

  handleChoice: function (event) {
    let desc = 0;
    switch (event.target.id) {
      case "wipeServer":
        desc = 2;
        break;
      case "wipeClient":
        desc = 1;
        break;
      case "doMerge":
        break;
    }
    this.page = 3;
    document.getElementById("chosenActionDeck").selectedIndex = desc;
  },

  updateConnectButton: function () {
    let str = Weave.Service.isLoggedIn ? this.bundle.getString("disconnect.label")
                                       : this.bundle.getString("connect.label");
    document.getElementById("connectButton").label = str;
    let notReady = Weave.Status.service == Weave.STATUS_DELAYED ? true : false;
    let pbEnabled = Weave.Svc.Private.privateBrowsingEnabled;
    document.getElementById("connectButton").disabled = notReady || pbEnabled;
  },

  handleConnectCommand: function () {
    Weave.Service.isLoggedIn ? Weave.Service.logout() : Weave.Service.login();
  },

  startOver: function () {
    Weave.Service.logout();
    Weave.Svc.Prefs.resetBranch("");
    this.updateWeavePrefs();
    document.getElementById("manageAccountExpander").className = "expander-down";
    document.getElementById("manageAccountControls").hidden = true;
  },

  recoverPassword: function () {
    let ok = Weave.Service.requestPasswordReset(Weave.Service.username);
    if (ok) { // xxxmpc: FIXME
      Weave.Svc.Prompt.alert(window,
                             this.bundle.getString("recoverPasswordSuccess.title"),
                             this.bundle.getString("recoverPasswordSuccess.label"));
    }
    else {
      // this should never ever get hit, so shouldn't get localized
      alert("Account name not on record, maybe it was deleted? EWTF_NO_ACCOUNT");
    }
  },

  changePassword: function () {
    Weave.Utils.openGenericDialog("ChangePassword");
  },

  changePassphrase: function () {
    Weave.Utils.openGenericDialog("ChangePassphrase");
  },

  resetPassphrase: function () {
    Weave.Utils.openGenericDialog("ResetPassphrase");
  },

  updateSyncPrefs: function () {
    let syncEverything = document.getElementById("weaveSyncMode").selectedItem.value == "syncEverything";
    document.getElementById("syncModeOptions").selectedIndex = syncEverything ? 0 : 1;

    if (syncEverything) {
      let prefs = this.prefArray;
      for (let i = 0; i < prefs.length; ++i)
        document.getElementById(prefs[i]).value = true;
    }
  },

  /**
   * Check whether all the preferences values are set to their default values
   *
   * @param aPrefs an array of pref names to check for
   * @returns boolean true if all of the prefs are set to their default values,
   *                  false otherwise
   */
  _checkDefaultValues: function () {
    let prefs = this.prefArray;
    for (let i = 0; i < prefs.length; ++i) {
      let pref = document.getElementById(prefs[i]);
      if (pref.value != pref.defaultValue)
        return false;
    }
    return true;
  },


  handleExpanderClick: function () {
    // ok, this is pretty evil, and likely fragile if the prefwindow
    // binding changes, but that won't happen in 3.6 *fingers crossed*
    let prefwindow = document.getElementById("BrowserPreferences");
    let pane = document.getElementById("paneWeaveServices");
    if (prefwindow._shouldAnimate)
      prefwindow._currentHeight = pane.contentHeight;

    let expander = document.getElementById("manageAccountExpander");
    let expand = expander.className == "expander-down";
    expander.className =
       expand ? "expander-up" : "expander-down";
    document.getElementById("manageAccountControls").hidden = !expand;

    // and... shazam
    if (prefwindow._shouldAnimate)
      prefwindow.animate("null", pane);
  },

  goBack: function () {
    this.page -= 1;
  },

  doSignIn: function () {
    Weave.Svc.Prefs.set("firstSync", "notReady");
    Weave.Service.username = document.getElementById("weaveUsername").value;
    Weave.Service.password = document.getElementById("weavePassword").value;
    Weave.Service.passphrase = document.getElementById("weavePassphrase").value;
    let serverURI =
      Weave.Utils.makeURI(document.getElementById("weaveServerURL").value);
    if (serverURI && !this._usingMainServers)
      Weave.Service.serverURL = serverURI.spec;
    else
      Weave.Svc.Prefs.reset("serverURL");

    Weave.Service.login();
  },

  setupInitialSync: function (syncChoice) {
    switch (syncChoice) {
      case "wipeRemote":
      case "wipeClient":
        Weave.Svc.Prefs.set("firstSync", syncChoice);
        break;
      case "merge":
        Weave.Svc.Prefs.reset("firstSync");
        break;
    }
    Weave.Service.syncOnIdle();
    this.updateWeavePrefs();
  },

  startAccountSetup: function () {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow("Weave:AccountSetup");
    if (win)
      win.focus();
    else {
      window.openDialog("chrome://weave/content/preferences/fx-setup.xul",
                        "migration", "centerscreen,chrome,resizable=no");
    }
  },

  isReady: function () {
    let ready = false;
    switch (this.page) {
      case "0":
        let hasUser = document.getElementById("weaveUsername").value != "";
        let hasPass = document.getElementById("weavePassword").value != "";
        if (hasUser && hasPass) {
          if (this._usingMainServers)
            return true;

          let uri = Weave.Utils.makeURI(document.getElementById("weaveServerURL").value);
          if (uri &&
              (uri.schemeIs("http") || uri.schemeIs("https")) &&
              uri.host != "")
            ready = true;
        }
        break;
      case "1":
        if (document.getElementById("weavePassphrase").value != "")
          ready = true;
        break;
    }

    return ready;
  },

  checkFields: function () {
    switch (this.page) {
      case "0":
        document.getElementById("signInButton").setAttribute("disabled", !this.isReady());
        break;
      case "1":
        document.getElementById("continueButton").setAttribute("disabled", !this.isReady());
        break;
    }
  },

  handleKeypress: function (event) {
    this.checkFields();
    if (event.keyCode != Components.interfaces.nsIDOMKeyEvent.DOM_VK_RETURN)
      return true;

    event.preventDefault();
    if (this.isReady()) {
      this.doSignIn();
    }

    return false;
  },

  // sets class and string on a feedback element
  // if no property string is passed in, we clear label/style
  _setFeedbackMessage: function (element, success, string) {
    element.hidden = success;
    let label = element.firstChild.nextSibling;
    let classname = "";
    if (string) {
      classname = success ? "success" : "error";
    }
    label.value = string || "";
    label.className = classname;
  }
}
