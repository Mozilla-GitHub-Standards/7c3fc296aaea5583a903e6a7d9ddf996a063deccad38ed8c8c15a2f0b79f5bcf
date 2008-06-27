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
 *  Myk Melez <myk@mozilla.org>
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

const EXPORTED_SYMBOLS = ['Engines',
                          'Engine'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://weave/log4moz.js");
Cu.import("resource://weave/constants.js");
Cu.import("resource://weave/util.js");
Cu.import("resource://weave/wrap.js");
Cu.import("resource://weave/crypto.js");
Cu.import("resource://weave/dav.js");
Cu.import("resource://weave/remote.js");
Cu.import("resource://weave/identity.js");
Cu.import("resource://weave/stores.js");
Cu.import("resource://weave/syncCores.js");
Cu.import("resource://weave/trackers.js");
Cu.import("resource://weave/async.js");

Function.prototype.async = Async.sugar;

// Singleton service, holds registered engines

Utils.lazy(this, 'Engines', EngineManagerSvc);

function EngineManagerSvc() {
  this._engines = {};
}
EngineManagerSvc.prototype = {
  get: function EngMgr_get(name) {
    return this._engines[name];
  },
  getAll: function EngMgr_getAll() {
    let ret = [];
    for (key in this._engines) {
      ret.push(this._engines[key]);
    }
    return ret;
  },
  register: function EngMgr_register(engine) {
    this._engines[engine.name] = engine;
  },
  unregister: function EngMgr_unregister(val) {
    let name = val;
    if (val instanceof Engine)
      name = val.name;
    delete this._engines[name];
  }
};

function Engine() {}
Engine.prototype = {
  _notify: Wrap.notify,

  // "default-engine";
  get name() { throw "name property must be overridden in subclasses"; },

  // "DefaultEngine";
  get logName() { throw "logName property must be overridden in subclasses"; },

  // "user-data/default-engine/";
  get serverPrefix() { throw "serverPrefix property must be overridden in subclasses"; },

  get snapshot() this._snapshot,

  get _remote() {
    if (!this.__remote)
      this.__remote = new RemoteStore(this);
    return this.__remote;
  },

  get enabled() {
    return Utils.prefs.getBoolPref("engine." + this.name);
  },

  __os: null,
  get _os() {
    if (!this.__os)
      this.__os = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    return this.__os;
  },

  __json: null,
  get _json() {
    if (!this.__json)
      this.__json = Cc["@mozilla.org/dom/json;1"].
        createInstance(Ci.nsIJSON);
    return this.__json;
  },

  // _core, _store and _tracker need to be overridden in subclasses
  __core: null,
  get _core() {
    if (!this.__core)
      this.__core = new SyncCore();
    return this.__core;
  },

  __store: null,
  get _store() {
    if (!this.__store)
      this.__store = new Store();
    return this.__store;
  },

  __tracker: null,
  get _tracker() {
    if (!this.__tracker)
      this.__tracker = new Tracker();
    return this.__tracker;
  },

  __snapshot: null,
  get _snapshot() {
    if (!this.__snapshot)
      this.__snapshot = new SnapshotStore(this.name);
    return this.__snapshot;
  },
  set _snapshot(value) {
    this.__snapshot = value;
  },

  get engineId() {
    let id = ID.get('Engine:' + this.name);
    if (!id) {
      // Copy the service login from WeaveID
      let masterID = ID.get('WeaveID');

      id = new Identity(this.logName, masterID.username, masterID.password);
      ID.set('Engine:' + this.name, id);
    }
    return id;
  },

  _init: function Engine__init() {
    this._log = Log4Moz.Service.getLogger("Service." + this.logName);
    this._log.level =
      Log4Moz.Level[Utils.prefs.getCharPref("log.logger.service.engine")];
    this._osPrefix = "weave:" + this.name + ":";
    this._snapshot.load();
  },

  _serializeCommands: function Engine__serializeCommands(commands) {
    let json = this._json.encode(commands);
    //json = json.replace(/ {action/g, "\n {action");
    return json;
  },

  _serializeConflicts: function Engine__serializeConflicts(conflicts) {
    let json = this._json.encode(conflicts);
    //json = json.replace(/ {action/g, "\n {action");
    return json;
  },

  _resetServer: function Engine__resetServer() {
    let self = yield;
    yield this._remote.wipe(self.cb);
  },

  _resetClient: function Engine__resetClient() {
    let self = yield;
    this._log.debug("Resetting client state");
    this._snapshot.wipe();
    this._store.wipe();
    this._log.debug("Client reset completed successfully");
  },

  //       original
  //         / \
  //      A /   \ B
  //       /     \
  // client --C-> server
  //       \     /
  //      D \   / C
  //         \ /
  //        final

  // If we have a saved snapshot, original == snapshot.  Otherwise,
  // it's the empty set {}.

  // C is really the diff between server -> final, so if we determine
  // D we can calculate C from that.  In the case where A and B have
  // no conflicts, C == A and D == B.

  // Sync flow:
  // 1) Fetch server deltas
  // 1.1) Construct current server status from snapshot + server deltas
  // 1.2) Generate single delta from snapshot -> current server status ("B")
  // 2) Generate local deltas from snapshot -> current client status ("A")
  // 3) Reconcile client/server deltas and generate new deltas for them.
  //    Reconciliation won't generate C directly, we will simply diff
  //    server->final after step 3.1.
  // 3.1) Apply local delta with server changes ("D")
  // 3.2) Append server delta to the delta file and upload ("C")

  _sync: function Engine__sync() {
    let self = yield;

    this._log.info("Beginning sync");

    try {
      yield this._remote.openSession(self.cb);
    } catch (e if e.status == 404) {
      yield this._initialUpload.async(this, self.cb);
      return;
    }

    if (this._remote.status.data.GUID != this._snapshot.GUID) {
      this._log.debug("Remote/local sync GUIDs do not match.  " +
                     "Forcing initial sync.");
      this._log.trace("Remote: " + this._remote.status.data.GUID);
      this._log.trace("Local: " + this._snapshot.GUID);
      this._store.resetGUIDs();
      this._snapshot.data = {};
      this._snapshot.version = -1;
      this._snapshot.GUID = this._remote.status.data.GUID;
    }

    this._log.info("Local snapshot version: " + this._snapshot.version);
    this._log.info("Server maxVersion: " + this._remote.status.data.maxVersion);

    if ("none" != Utils.prefs.getCharPref("encryption"))
      yield this._remote.keys.getKeyAndIV(self.cb, this.engineId);

    // 1) Fetch server deltas
    let server = {};
    let serverSnap = yield this._remote.wrap(self.cb, this._snapshot);
    server.snapshot = serverSnap.data;
    this._core.detectUpdates(self.cb, this._snapshot.data, server.snapshot);
    server.updates = yield;

    // 2) Generate local deltas from snapshot -> current client status

    let localJson = new SnapshotStore();
    localJson.data = this._store.wrap();
    this._core.detectUpdates(self.cb, this._snapshot.data, localJson.data);
    let localUpdates = yield;

    this._log.trace("local json:\n" + localJson.serialize());
    this._log.trace("Local updates: " + this._serializeCommands(localUpdates));
    this._log.trace("Server updates: " + this._serializeCommands(server.updates));

    if (server.updates.length == 0 && localUpdates.length == 0) {
      this._snapshot.version = this._remote.status.data.maxVersion;
      this._log.info("Sync complete: no changes needed on client or server");
      self.done(true);
      return;
    }

    // 3) Reconcile client/server deltas and generate new deltas for them.

    this._log.info("Reconciling client/server updates");
    this._core.reconcile(self.cb, localUpdates, server.updates);
    let ret = yield;

    let clientChanges = ret.propagations[0];
    let serverChanges = ret.propagations[1];
    let clientConflicts = ret.conflicts[0];
    let serverConflicts = ret.conflicts[1];

    this._log.info("Changes for client: " + clientChanges.length);
    this._log.info("Predicted changes for server: " + serverChanges.length);
    this._log.info("Client conflicts: " + clientConflicts.length);
    this._log.info("Server conflicts: " + serverConflicts.length);
    this._log.trace("Changes for client: " + this._serializeCommands(clientChanges));
    this._log.trace("Predicted changes for server: " + this._serializeCommands(serverChanges));
    this._log.trace("Client conflicts: " + this._serializeConflicts(clientConflicts));
    this._log.trace("Server conflicts: " + this._serializeConflicts(serverConflicts));

    if (!(clientChanges.length || serverChanges.length ||
          clientConflicts.length || serverConflicts.length)) {
      this._log.info("Sync complete: no changes needed on client or server");
      this._snapshot.data = localJson.data;
      this._snapshot.version = this._remote.status.data.maxVersion;
      this._snapshot.save();
      self.done(true);
      return;
    }

    if (clientConflicts.length || serverConflicts.length) {
      this._log.warn("Conflicts found!  Discarding server changes");
    }

    let savedSnap = Utils.deepCopy(this._snapshot.data);
    let savedVersion = this._snapshot.version;
    let newSnapshot;

    // 3.1) Apply server changes to local store
    if (clientChanges.length) {
      this._log.info("Applying changes locally");
      // Note that we need to need to apply client changes to the
      // current tree, not the saved snapshot

      localJson.applyCommands.async(localJson, self.cb, clientChanges);
      yield;
      this._snapshot.data = localJson.data;
      this._snapshot.version = this._remote.status.data.maxVersion;
      this._store.applyCommands.async(this._store, self.cb, clientChanges);
      yield;
      newSnapshot = this._store.wrap();

      this._core.detectUpdates(self.cb, this._snapshot.data, newSnapshot);
      let diff = yield;
      if (diff.length != 0) {
        this._log.warn("Commands did not apply correctly");
        this._log.trace("Diff from snapshot+commands -> " +
                        "new snapshot after commands:\n" +
                        this._serializeCommands(diff));
        // FIXME: do we really want to revert the snapshot here?
        this._snapshot.data = Utils.deepCopy(savedSnap);
        this._snapshot.version = savedVersion;
      }
      this._snapshot.save();
    }

    // 3.2) Append server delta to the delta file and upload

    // Generate a new diff, from the current server snapshot to the
    // current client snapshot.  In the case where there are no
    // conflicts, it should be the same as what the resolver returned

    newSnapshot = this._store.wrap();
    this._core.detectUpdates(self.cb, server.snapshot, newSnapshot);
    let serverDelta = yield;

    // Log an error if not the same
    if (!(serverConflicts.length ||
          Utils.deepEquals(serverChanges, serverDelta)))
      this._log.warn("Predicted server changes differ from " +
                     "actual server->client diff (can be ignored in many cases)");

    this._log.info("Actual changes for server: " + serverDelta.length);
    this._log.trace("Actual changes for server: " +
                    this._serializeCommands(serverDelta));

    if (serverDelta.length) {
      this._log.info("Uploading changes to server");
      this._snapshot.data = newSnapshot;
      this._snapshot.version = ++this._remote.status.data.maxVersion;

      // XXX don't append delta if we do a full upload?
      if (this._remote.status.data.formatVersion != ENGINE_STORAGE_FORMAT_VERSION)
        yield this._remote.initialize(self.cb, this._snapshot);

      let c = 0;
      for (GUID in this._snapshot.data)
        c++;

      this._remote.appendDelta(self.cb, serverDelta,
                               {maxVersion: this._snapshot.version,
                                deltasEncryption: Crypto.defaultAlgorithm,
                                itemCount: c});
      yield;

      this._log.info("Successfully updated deltas and status on server");
      this._snapshot.save();
    }

    this._log.info("Sync complete");
    self.done(true);
  },

  _initialUpload: function Engine__initialUpload() {
    let self = yield;
    this._log.info("Initial upload to server");
    this._snapshot.data = this._store.wrap();
    this._snapshot.version = 0;
    this._snapshot.GUID = null; // in case there are other snapshots out there
    yield this._remote.initialize(self.cb, this._snapshot);
    this._snapshot.save();
  },

  _share: function Engine__share(guid, username) {
    let self = yield;
    /* This should be overridden by the engine subclass for each datatype.
       Implementation should share the data node identified by guid,
       and all its children, if any, with the user identified by username. */
    self.done();
  },

  _stopSharing: function Engine__stopSharing(guid, username) {
    let self = yield;
    /* This should be overridden by the engine subclass for each datatype.
     Stop sharing the data node identified by guid with the user identified
     by username.*/
    self.done();
  },

  sync: function Engine_sync(onComplete) {
    return this._sync.async(this, onComplete);
  },

  share: function Engine_share(onComplete, guid, username) {
    return this._share.async(this, onComplete, guid, username);
  },

  stopSharing: function Engine_share(onComplete, guid, username) {
    return this._stopSharing.async(this, onComplete, guid, username);
  },

  resetServer: function Engimne_resetServer(onComplete) {
    this._notify("reset-server", this._resetServer).async(this, onComplete);
  },

  resetClient: function Engine_resetClient(onComplete) {
    this._notify("reset-client", this._resetClient).async(this, onComplete);
  }
};
