var Ci = Components.interfaces;
var Cc = Components.classes;
var Cr = Components.results;

let Change = {
  get _stringBundle() {
    let stringBundle = document.getElementById("weaveStringBundle");
    this.__defineGetter__("_stringBundle", function() { return stringBundle; });
    return this._stringBundle;
  },

  get _dialog() {
    delete this._dialog;
    return this._dialog = document.getElementById("change-dialog");
  },

  get _dialogType() {
    delete this._dialogType;
    return this._dialogType = Weave.Utils._genericDialogType;
  },

  get _title() {
    return document.getElementById("change-dialog").getAttribute("title");
  },

  set _title(val) {
    document.getElementById("change-dialog").setAttribute("title", val);
  },

  get _status() {
    delete this._status;
    return this._status = document.getElementById("status");
  },

  get _statusIcon() {
    delete this._statusIcon;
    return this._statusIcon = document.getElementById("statusIcon");
  },

  get _firstBox() {
    delete this._firstBox;
    return this._firstBox = document.getElementById("textBox1");
  },

  get _secondBox() {
    delete this._secondBox;
    return this._secondBox = document.getElementById("textBox2");
  },

  get _currentPasswordInvalid() {
    return Weave.Status.login == Weave.LOGIN_FAILED_LOGIN_REJECTED;
  },

  get _updatingPassphrase() {
    return this._dialogType == "UpdatePassphrase";
  },

  onLoad: function Change_onLoad() {
    /* Load labels */
    let box1label = document.getElementById("textBox1Label");
    let box2label = document.getElementById("textBox2Label");
    let introText = document.getElementById("introText");
    let introText2 = document.getElementById("introText2");
    let warningText = document.getElementById("warningText");

    switch (this._dialogType) {
      case "UpdatePassphrase":
      case "ResetPassphrase":
        box1label.value = this._str("new.passphrase.label");
        this._dialog.setAttribute(
          "ondialogaccept",
          "return Change.doChangePassphrase();"
        );

        if (this._updatingPassphrase) {
          this._title = this._str("new.passphrase.title");
          introText.innerHTML = this._str("new.passphrase.introText");
          this._dialog.getButton("accept")
              .setAttribute("label", this._str("new.passphrase.acceptButton"));
          document.getElementById("textBox2Row").hidden = true;
        }
        else {
          this._title = this._str("change.passphrase.title");
          box2label.value = this._str("new.passphrase.confirm");
          introText.innerHTML = this._str("change.passphrase.introText");
          introText2.innerHTML = this._str("change.passphrase.introText2");
          warningText.innerHTML = this._str("change.passphrase.warningText");
          this._dialog.getButton("accept")
              .setAttribute("label", this._str("change.passphrase.acceptButton"));
        }
        break;
      case "ChangePassword":
        box1label.value = this._str("new.password.label");
        this._dialog.setAttribute(
          "ondialogaccept",
          "return Change.doChangePassword();"
        );

        if (this._currentPasswordInvalid) {
          this._title = this._str("new.password.title");
          introText.innerHTML = this._str("new.password.introText");
          this._dialog.getButton("accept")
              .setAttribute("label", this._str("new.password.acceptButton"));
          document.getElementById("textBox2Row").hidden = true;
        }
        else {
          this._title = this._str("change.password.title");
          box2label.value = this._str("new.password.confirm");
          introText.innerHTML = this._str("change.password.introText");
          warningText.innerHTML = this._str("change.password.warningText");
          this._dialog.getButton("accept")
              .setAttribute("label", this._str("change.password.acceptButton"));
        }
        break;
    }
  },

  _clearStatus: function _clearStatus() {
    this._status.value = "";
    this._statusIcon.removeAttribute("status");
  },

  _updateStatus: function Change__updateStatus(str, state) {
     this._updateStatusWithString(this._str(str), state);
  },
  
  _updateStatusWithString: function Change__updateStatusWithString(string, state) {
    this._status.value = string;
    this._statusIcon.setAttribute("status", state);

    let error = state == "error";
    this._dialog.getButton("cancel").setAttribute("disabled", !error);
    this._dialog.getButton("accept").setAttribute("disabled", !error);

    if (state == "success")
      window.setTimeout(window.close, 1500);
  },

  doChangePassphrase: function Change_doChangePassphrase() {
    if (this._updatingPassphrase) {
      Weave.Service.passphrase = this._firstBox.value;
      if (Weave.Service.login()) {
        this._updateStatus("change.passphrase.success", "success");
        Weave.Service.persistLogin();
      }
      else
        this._updateStatus("new.passphrase.status.incorrect", "error");
    }
    else {
      this._updateStatus("change.passphrase.label", "active");

      if (Weave.Service.changePassphrase(this._firstBox.value))
        this._updateStatus("change.passphrase.success", "success");
      else
        this._updateStatus("change.passphrase.error", "error");
    }

    return false;
  },

  doChangePassword: function Change_doChangePassword() {
    if (this._currentPasswordInvalid) {
      Weave.Service.password = this._firstBox.value;
      if (Weave.Service.login()) {
        this._updateStatus("change.password.status.success", "success");
        Weave.Service.persistLogin();
      }
      else
        this._updateStatus("new.password.status.incorrect", "error");
    }
    else {
      this._updateStatus("change.password.status.active", "active");

      if (Weave.Service.changePassword(this._firstBox.value))
        this._updateStatus("change.password.status.success", "success");
      else
        this._updateStatus("change.password.status.error", "error");
    }

    return false;
  },

  validate: function (event) {
    let valid = false;
    let errorString = "";

    if (this._dialogType == "ChangePassword") {
      if (this._currentPasswordInvalid)
        [valid, errorString] = gWeaveCommon.validatePassword(this._firstBox);
      else
        [valid, errorString] = gWeaveCommon.validatePassword(this._firstBox, this._secondBox);
    }
    else {
      if (this._updatingPassphrase)
        [valid, errorString] = gWeaveCommon.validatePassphrase(this._firstBox);
      else
        [valid, errorString] = gWeaveCommon.validatePassphrase(this._firstBox, this._secondBox);
    }

    if (errorString == "")
      this._clearStatus();
    else
      this._updateStatusWithString(errorString, "error");

    this._dialog.getButton("accept").disabled = !valid;
  },

  _str: function Change__string(str) {
    return this._stringBundle.getString(str);
  }
};
