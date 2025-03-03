import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

// eslint-disable-next-line
'use strict';

/**
 * Represents the DBus proxy class instance.
 * @typedef {{
 *  ListNamesRemote(callbackFn: (data: [string[]]) => never): never;
 *  ListNamesSync(): [string[]];
 *  ListNamesAsync(): Promise<[string[]]>;
 *  connectSignal(signal: string, callbackFn: (proxy, sender, []: [name: string, oldOwner: string, newOwner: string]) => void): any
 *  disconnectSignal(handlerId: any): void
 *  }} DBusProxy
 */
/**
 * Represents the DBus proxy class.
 * @typedef {{
 *  new(
 *      bus: string,
 *      name: string,
 *      objectPath: string,
 *      proxy: (proxy: DBusProxy) => void): DBusProxy;
 * }} DBusProxyClass
 */
const DBusInterface = `<node>
    <interface name="org.freedesktop.DBus">
        <method name="ListNames">
            <arg type="as" direction="out" />
        </method>
        <signal name="NameAcquired">
            <arg type="s"/>
        </signal>
    </interface>
</node>`;

/**
 * Represents the DBus Mpris Player proxy class instance.
 * @typedef {{
 *  PlaybackStatus: string;
 *  connect(signal: string, callbackFn: (player: DBusMprisPlayerProxy) => void): any
 *  disconnect(handlerId: number): void
 * }} DBusMprisPlayerProxy
 */
/**
 * Represents the DBus Mpris Player proxy class.
 * @typedef {{
 *  new(
 *      bus: string,
 *      name: string,
 *      objectPath: string,
 *      player: (player: DBusMprisPlayerProxy) => void): DBusMprisPlayerProxy;
 * }} DBusMprisPlayerProxyClass
 */
const DBusMprisPlayerInterface = `<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <property name="PlaybackStatus" type="s" access="read"/>
  </interface>
</node>`;

// ======================

/**
 * MprisPlayer singleton class.
 * Call `MprisPlayer.Get()` & `MprisPlayer.Destroy()`.
 */
const MprisPlayer = GObject.registerClass({
    Signals: {
        isPlaying: {
            param_types: [GObject.TYPE_BOOLEAN]
        }
    }
}, class MprisPlayer extends GObject.Object {
    /**
     * @type {_MprisPlayer | undefined}
     */
    static _instance;

    static get isActive() {
        return this._instance !== undefined;
    }

    /**
     * Get singleton instance of MprisMediaPlayer2
     * @returns {_MprisPlayer}
     */
    static Get() {
        if (this._instance) {
            return this._instance;
        }
        this._instance = new MprisPlayer();
        return this._instance;
    }

    /**
     * Destroy the singleton instance of MprisMediaPlayer2
     * @returns {void}
     */
    static Destroy() {
        if (this._instance) {
            this._instance._onDestroy();
        }
        this._instance = undefined;
    }

    /**
     * @readonly
     * @type {DBusMprisPlayerProxyClass}
     */
    _DBusPlayerProxy;

    /**
     * @readonly
     * @type {DBusProxy}
     */
    _dbusProxy;

    /**
     * @readonly
     * @type {any}
     */
    _dbusHandlerId;

    _mprisPrefix = 'org.mpris.MediaPlayer2.';

    /**
     * All players with player dbusProxy instance
     * @type {Map<string, { handlerId: number, playerProxy: DBusMprisPlayerProxy }>}
     */
    _activePlayers = new Map();

    /**
     * All players with player dbusProxy instance
     * @type {Set<any>}
     */
    _connections = new Set();

    _isPlaying = false;
    get isPlaying() {
        return this._isPlaying;
    }

    _lastEmittedPlayStatus = false;

    refresh() {
        const dbusNames = this._getMPlayerApps();
        dbusNames.forEach((dbusName) => this._addPlayer(dbusName));
        this._emitPlayStatus(true);
    }

    /**
     * Set a callback function to isPlaying status changes.
     * Use `disconnectIsPlaying(connectId)` to disconnect manually or `MprisPlayer.Destroy()`
     * to destroy all connections.
     * @param {(isPlaying: boolean) => void} callbackFn Callback function
     * @returns {any}
     */
    connectIsPlaying(callbackFn) {
        const connectId = this.connect(
            'isPlaying',
            (_, isPlaying) => callbackFn(isPlaying)
        );
        this._connections.add(connectId);
        return connectId;
    }

    /**
     * Manually disable a single `connectIsPlaying` connection.
     * Run `MprisPlayer.Destroy()` to cleanup all connections.
     * @param {any} connectId The `connectId` recieved from `connectIsPlaying()`.
     * @returns {void}
     */
    disconnectIsPlaying(connectId) {
        if (!this._connections.has(connectId)) {
            return;
        }
        this.disconnect(connectId);
        this._connections.delete(connectId);
        return connectId;
    }

    _emitPlayStatus(forceEmit = false) {
        if (this._lastEmittedPlayStatus === this.isPlaying && !forceEmit) {
            return;
        }
        this._lastEmittedPlayStatus = this.isPlaying;
        this.emit('isPlaying', this.isPlaying);
    }

    /**
     * @param {string} dbusName Name in dbus
     */
    _addPlayer(dbusName) {
        if (this._activePlayers.has(dbusName)) {
            return;
        }

        const dbusPlayerProxy = new this._DBusPlayerProxy(
            Gio.DBus.session,
            dbusName,
            '/org/mpris/MediaPlayer2',
            (_player) => this._onPlayerChange()
        );

        const handlerId = dbusPlayerProxy.connect(
            'g-properties-changed',
            (_player) => this._onPlayerChange()
        );

        this._activePlayers.set(dbusName, {
            handlerId,
            playerProxy: dbusPlayerProxy
        });
    }

    /**
     * @param {string} dbusName Name in dbus
     */
    _removePlayer(dbusName) {
        const player = this._activePlayers.get(dbusName);
        if (!player) {
            return;
        }
        player.playerProxy.disconnect(player.handlerId);
        this._activePlayers.delete(dbusName);
    }

    _onPlayerChange() {
        let isPlaying = false;
        for (const player of this._activePlayers.values()) {
            if (player.playerProxy.PlaybackStatus === 'Playing') {
                isPlaying = true;
            }
        }
        this._isPlaying = isPlaying;
        this._emitPlayStatus();
    }

    /**
     * @param {*} _proxy -
     * @param {*} _sender -
     * @param {[string, string, string]} owner -
     * @returns {void}
     */
    _onNameOwnerChanged(_proxy, _sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(this._mprisPrefix)) {
            return;
        }
        if (newOwner === '') {
            this._removePlayer(name);
        } else if (oldOwner === '') {
            this._addPlayer(name);
        }
        this._onPlayerChange();
    }

    /**
     * Get the dbus name list for mpris players
     * @returns {string[]}
     */
    _getMPlayerApps() {
        const [names] = this._dbusProxy.ListNamesSync();
        const mprisPlayers = names.filter((dbusName) =>
            dbusName.startsWith(this._mprisPrefix)
        );

        return mprisPlayers;
    }

    _onDestroy() {
        this._dbusProxy.disconnectSignal(this._dbusHandlerId);
        for (const dbusName of this._activePlayers.keys()) {
            this._removePlayer(dbusName);
        }
        this._activePlayers.clear();

        for (const connectId of this._connections.values()) {
            this.disconnectIsPlaying(connectId);
        }
        this._connections.clear();
    }

    constructor() {
        super();

        /** @type {DBusProxyClass} */
        const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
        this._DBusPlayerProxy = Gio.DBusProxy.makeProxyWrapper(
            DBusMprisPlayerInterface
        );

        this._dbusProxy = new DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            (_proxy) => this._onPlayerChange()
        );

        this._dbusHandlerId = this._dbusProxy.connectSignal(
            'NameOwnerChanged',
            (...args) => this._onNameOwnerChanged(...args)
        );

        this.refresh();
    }
});

export { MprisPlayer };
