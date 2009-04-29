/* Look at incoming pages for OpenID forms and munge them.
   This is hacky and makes a lot of unjustified assumptions about forms. */

/* Listen for URLs that point to Weave OpenID provider and intercept */
var gOpenIDProviderListener = {
    QueryInterface: function(aIID) {
       if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
           aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
           aIID.equals(Components.interfaces.nsISupports))
         return this;
       throw Components.results.NS_NOINTERFACE;
      },

      onLocationChange: function(aProgress, aRequest, aURI) {
        gOpenIdMunger.processNewURL(aURI);
      },

      onStateChange: function() {},
      onProgressChange: function() {},
      onStatusChange: function() {},
      onSecurityChange: function() {},
      onLinkIconAvailable: function() {}
}
/* According to OpenID docs at
 http://openid.net/specs/openid-authentication-2_0.html#initiation
 the form SHOULD have an input field with name = "openid_identifier". */
const OPENID_FIELD_NAME = "openid_identifier";
const OPENID_SERVICE_URI = "services.mozilla.com/openid/";
const OPENID_PREF = "extensions.weave.openId.enabled";

/* When we find an openID field, grey it out and put the user's Weave-based openID URI into
 * it, while changing the submit button to say "Sign In with Weave".  But only do this if
 * OPENID_PREF is turned on.
 */

var gOpenIdMunger = {
  _prefs: null,
  get _prefs() {
      return Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
  },

  init: function() {
    /* Listen for webpage loads */
    if ( gOpenIdMunger._prefs.getBoolPref( OPENID_PREF ) ) {
      if (typeof(gBrowser) != "undefined") {
        var appcontent = document.getElementById("appcontent");   // browser
        if(appcontent) {
          appcontent.addEventListener("DOMContentLoaded",
                                      gOpenIdMunger.detectForm, true);
        }
      }
    }

    /* Listen for redirects to Weave OpenID provider regardless of pref */
    if (typeof(gBrowser) != "undefined") {
        gBrowser.addProgressListener(gOpenIDProviderListener,
        Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    }
  },

  uninit: function() {
    if ( gOpenIdMunger._prefs.getBoolPref( OPENID_PREF ) ) {
      if (typeof(gBrowser) != "undefined") {
        var appcontent = document.getElementById("appcontent");   // browser
        if(appcontent) {
          appcontent.removeEventListener("DOMContentLoaded",
                                      gOpenIdMunger.detectForm, true);
        }
      }
    }

    if (typeof(gBrowser) != "undefined")
      gBrowser.removeProgressListener(gOpenIDProviderListener);
  },

  detectForm: function(aEvent) {
    var theDoc = aEvent.originalTarget;
    let inputs = theDoc.getElementsByTagName("input");
    let i;
    let weaveUsername = gOpenIdMunger._prefs.getCharPref("extensions.weave.username");
    // Find text input fields for OpenID identifiers:
    for (i = 0; i < inputs.length; i++) {
      let elem = inputs.item(i);
      if (elem.name == OPENID_FIELD_NAME ) {
        /* Turn the text input field into a hidden field, and fill in the value with our
         * Weave-based OpenID identifier.  Trial and error shows that we have to set type
         * before we set value, because changing the type of a field seems to reset its value
         * to the one defined in the page.  Not sure if this is a DOM bug or purposeful
         * behavior but that seems to be how it works at least in firefox 3.5.
         */
        elem.type = "hidden";
        elem.value = OPENID_SERVICE_URI + weaveUsername;

        let form = elem.form;
        let formChildren = form.getElementsByTagName("input");
        // Find the submit button in the same form and change the text on the button:
        for (let j=0; j < formChildren.length; j++) {
          if (formChildren[j].type == "submit") {
            formChildren[j].value = "Sign In Using Weave";
          }
        }
      }
    }
  },

  processNewURL: function(aURI) {
    if (!aURI || aURI.spec == this.oldURL)
      return;

    /* Now we know the url is new... */
    if (aURI.spec.substr(0, 37) ==
        'https://services.mozilla.com/openid/?') {
      /* Stop the redirect */
      window.stop();

      /* Parse tokens */
      let pstring = aURI.spec.substr(37);
      let params = pstring.split('&');
      let retURI = false;

      for (let i = 0; i < params.length; i++) {
        if (params[i].substr(0, 16)  == "openid.return_to") {
          retURI = params[i].split('=');
          retURI = decodeURIComponent(retURI[1]);
          break;
        }
      }

      if (!retURI) {
        /* No return_to was specified! */
        window.back();
      }

      /* Make the request */
      this.authorize(retURI, this.authorizeDone);
    }
  },

  authorize: function (rurl, cb) {
    let req = new XMLHttpRequest();
    let usr = Weave.ID.get('WeaveID').username;
    let pwd = Weave.ID.get('WeaveID').password;

    /* Extract hostname out of return URL */
    let re = new RegExp('^(?:f|ht)tp(?:s)?\://([^/]+)', 'im');
    let site = rurl.match(re)[1].toString();

    let params = 'uid=' + encodeURIComponent(usr);
    params = params + '&pwd=' + encodeURIComponent(pwd);
    params = params + '&site=' + encodeURIComponent(site);

    let uri = 'https://services.mozilla.com/openid-api/authorize.php';
    req.onreadystatechange = function(e) {
      if (req.readyState == 4) {
        if (req.status == 200) {
          cb(rurl, req.responseText, usr);
        } else {
          cb(rurl, false, usr);
        }
      }
    };
    req.open('POST', uri);
    req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    req.setRequestHeader('Content-length', params.length);
    req.setRequestHeader('Connection', 'close');
    req.send(params);
  },

  authorizeDone: function(rurl, token, usr) {
    if (!token) {
      /* Could not authorize */
      window.content.location = rurl + '&openid.mode=cancel';
    } else {
      let identity = encodeURIComponent(
        'https://services.mozilla.com/openid/' + usr
      );
      /* TODO generate signature */
      let signed = 'mode,identity,assoc_handle,return_to';
      let sig = '';

      /* Construct return URL */
      let uri = rurl + '&openid.mode=id_res';
      uri = uri + '&openid.identity=' + identity;
      uri = uri + '&openid.assoc_handle=' + token;
      uri = uri + '&openid.return_to=' + encodeURIComponent(rurl);
      uri = uri + '&openid.signed=' + encodeURIComponent(signed);
      uri = uri + '&openid.signature=' + sig;

      /* Redirect user to consumer. We're done! */
      window.content.location = uri;
    }
  }
};

window.addEventListener("load", function() {gOpenIdMunger.init();}, false);
window.addEventListener("unload", function() {gOpenIdMunger.uninit();}, false);
