// @ts-check
// @ts-expect-error
import Gio from 'gi://Gio';
// @ts-expect-error
import GObject from 'gi://GObject';

// eslint-disable-next-line
'use strict';

/**
 * Represents the DBus proxy class instance.
 * @typedef {{
 *  ListNamesRemote(callbackFn: (data: [string[]]) => never): never;
 *  ListNamesSync(): [string[]];
 *  ListNamesAsync(): Promise<[string[]]>;
 *  connectSignal(signal: string, callbackFn: (proxy, sender, [name, oldOwner, newOwner]) => void): any
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

class PrivateContructorParams {
    dont = 'doit';
}

// ======================

class _MprisPlayer extends GObject.Object {
    /**
     * @type {_MprisPlayer | undefined}
     */
    static _instance;

    static get isActive() {
        return this._instance !== undefined;
    }

    /**
     * Get singleton instance of MprisMediaPlayer2
     * @returns { _MprisPlayer }
     */
    static Get() {
        if (this._instance) {
            return this._instance;
        }
        this._instance = new MprisPlayer(new PrivateContructorParams());
        return this._instance;
    }

    static Destroy() {
        if (this._instance) {
            this._instance._onDestroy();
        }
        this._instance = undefined;
    }

    /**
     * @readonly
     * @type {DBusProxyClass}
     */
    _DBusProxy;

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

    _onNameOwnerChanged(_proxy, _sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(this._mprisPrefix)) {
            return;
        }
        if (oldOwner && !newOwner) {
            this._removePlayer(name);
        }
        if (newOwner && !oldOwner) {
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
    }

    /**
     * @param {any} params No params needed
     */
    constructor(params) {
        super();
        // Declare some GObject.Object (non typescript has some difficulty with this weird import)
        if (!this.emit) {
            this.emit = super.emit;
        }
        if (!this.connect) {
            this.connect = super.connect;
        }

        if (!(params instanceof PrivateContructorParams)) {
            throw new TypeError(
                'MprisMediaPlayer2 is not constructable. ' +
                'Use `MprisMediaPlayer2.Get()` and `MprisMediaPlayer2.Destroy()`'
            );
        }

        this._DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
        this._DBusPlayerProxy = Gio.DBusProxy.makeProxyWrapper(
            DBusMprisPlayerInterface
        );

        this._dbusProxy = new this._DBusProxy(
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
}

/**
 * MprisPlayer singleton class.
 * Call `MprisPlayer.Get()` & `MprisPlayer.Destroy()`.
 * @type { typeof _MprisPlayer }
 */
const MprisPlayer = GObject.registerClass(
    {
        Signals: {
            isPlaying: {
                param_types: [GObject.TYPE_BOOLEAN]
            }
        }
    },
    _MprisPlayer
);

export { MprisPlayer };
