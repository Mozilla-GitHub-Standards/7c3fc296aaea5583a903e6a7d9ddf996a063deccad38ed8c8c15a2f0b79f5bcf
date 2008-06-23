const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://weave/log4moz.js");
Cu.import("resource://weave/service.js");

let WeaveStatus = {
  get _os() {
    delete this._os;
    return this._os = Cc["@mozilla.org/observer-service;1"].
                      getService(Ci.nsIObserverService);
  },

  get _log() {
    delete this._log;
    return this._log = Log4Moz.Service.getLogger("Sync.Status");
  },

  get _stringBundle() {
    delete this._stringBundle;
    return this._stringBundle = document.getElementById("weaveStringBundle");
  },

  get _statusBox() {
    delete this._statusBox;
    return this._statusBox = document.getElementById("statusBox");
  },

  get _statusText() {
    delete this._statusText;
    return this._statusText = document.getElementById("statusText");
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  onLoad: function WeaveStatus_onLoad() {
    this._os.addObserver(this, "weave:service:sync:start", true);
    this._os.addObserver(this, "weave:service:sync:success", true);
    this._os.addObserver(this, "weave:service:sync:error", true);

    try {
      Weave.Service.sync();
    }
    catch(ex) {
      this._log.error("error starting quit sync: " + ex);
      window.close();
    }

    // XXX Should we set a timeout to cancel sync if it takes too long?
  },

  onUnload: function WeaveStatus_onUnload() {
    this._os.removeObserver(this, "weave:service:sync:start");
    this._os.removeObserver(this, "weave:service:sync:success");
    this._os.removeObserver(this, "weave:service:sync:error");
  },

  // nsIObserver

  observe: function WeaveSync__observe(subject, topic, data) {
    switch (topic) {
      case "weave:service:sync:start":
        this._log.info("starting quit sync");

        this._statusBox.setAttribute("status", "active");
        this._statusText.value = this._stringBundle.getString("status.active");

        break;

      case "weave:service:sync:success":
        this._log.info("quit sync succeeded");

        this._statusBox.setAttribute("status", "success");
        this._statusText.value = this._stringBundle.getString("status.success");

        // Delay closing the window for a couple seconds to give the user time
        // to see the result of the sync.
        window.setTimeout(window.close, 2000);

        // FIXME: send a growl or other low-priority notification.

        break;

      case "weave:service:sync:error":
        this._log.info("quit sync failed");

        this._statusBox.setAttribute("status", "error");
        this._statusText.value = this._stringBundle.getString("status.error");

        // Delay closing the window for a couple seconds to give the user time
        // to see the result of the sync.
        window.setTimeout(window.close, 2000);

        // FIXME: send a growl or other low-priority notification, or don't exit
        // and let the user try again.

        break;
    }
  }

};
