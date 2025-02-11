// @ts-check
// @ts-expect-error
import Gio from 'gi://Gio';
// @ts-expect-error
import GLib from 'gi://GLib';
// @ts-expect-error
import GObject from 'gi://GObject';

'use strict';

/**
 * Represents the DBus proxy class instance.
 * @typedef {{
 *  ListNamesRemote(callbackFn: (data: [string[]]) => never): never;
 *  ListNamesSync(): [string[]];
 *  ListNamesAsync(): Promise<[string[]]>;
 *  connectSignal(signal: string, callbackFn: (...args: any) => void): void
 *  }} DBusProxy
 */
/**
 * Represents the DBus proxy class.
 * @typedef {{
 *  new(...args: any): DBusProxy
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
 * Represents the DBus Mpris Player proxy instance.
 * @typedef {{
 *  PlaybackStatus: string;
 *  connect(signal: string, callbackFn: (player: DBusMprisPlayerProxy) => void): void
 * }} DBusMprisPlayerProxy
 */
/**
 * Represents the DBus Mpris Player proxy class.
 * @typedef {{
 *  new(...args: any): DBusMprisPlayerProxy;
 * }} DBusMprisPlayerProxyClass
 */
const DBusMprisPlayerInterface = `<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <property name="PlaybackStatus" type="s" access="read"/>
  </interface>
</node>`;

class PrivateContructorParams {
    dont = "doit"
}

// ======================

class _MprisPlayer extends GObject.Object {

    /**
     * @type {_MprisPlayer}
     */
    static #instance;

    /**
     * Get singleton instance of MprisMediaPlayer2
     * @returns { Promise<_MprisPlayer> }
     */
    static async Get() {
        if (this.#instance) return this.#instance;
        this.#instance = new MprisPlayer(new PrivateContructorParams());
        await this.#instance.#init();
        return this.#instance
    }

    /** 
     * @readonly
     * @type {DBusProxyClass}
     */
    #DBusProxy;

    /**
     * @readonly
     * @type {DBusMprisPlayerProxyClass}
     */
    #DBusPlayerProxy;

    /**
     * @readonly
     * @type {DBusProxy}
    */
    #dbusProxy;

    #mprisPrefix = "org.mpris.MediaPlayer2.";

    /**
     * All players with player dbusProxy instance
     * @type {Map<string, DBusMprisPlayerProxy>}
     */
    #activePlayers = new Map();

    /**
     * True if any of the players are playing.
     * Flase if none of the players are playing.
     * @type { boolean }
     */
    #isPlaying = false;
    get isPlaying() {
        return this.#isPlaying
    }

    #lastEmittedPlayStatus = false;

    async #init() {
        await this.refresh();
    }

    async refresh() {
        const dbusNames = await this.#getMPlayerApps();
        dbusNames.forEach(dbusName => this.#addPlayer(dbusName));
        this.#emitPlayStatus(true);
    }

    #emitPlayStatus(forceEmit = false) {
        if (this.#lastEmittedPlayStatus === this.isPlaying && !forceEmit) return;
        this.#lastEmittedPlayStatus = this.isPlaying;
        this.emit("isPlaying", this.isPlaying);
    }

    #addPlayer(dbusName) {
        if (this.#activePlayers.has(dbusName)) return;

        const dbusPlayerProxy = new this.#DBusPlayerProxy(
            Gio.DBus.session,
            dbusName,
            "/org/mpris/MediaPlayer2",
            (player) => this.#onPlayerChange(player)
        );

        dbusPlayerProxy.connect(
            'g-properties-changed',
            (player) => this.#onPlayerChange(player),
        );

        this.#activePlayers.set(dbusName, dbusPlayerProxy)
    }

    /**
     * @param {DBusMprisPlayerProxy} _player 
     */
    #onPlayerChange(_player) {
        let isPlaying = false;
        for (const player of this.#activePlayers.values()) {
            if (player.PlaybackStatus === "Playing") isPlaying = true;
        };
        this.#isPlaying = isPlaying;
        this.#emitPlayStatus();
    }

    #onNameOwnerChanged(_proxy, _sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(this.#mprisPrefix)) return;
        if (newOwner && !oldOwner) this.#addPlayer(name);
    }

    /**
     * Get the dbus name list for mpris players
     * @returns {Promise<string[]>}
     */
    async #getMPlayerApps() {
        const [names] = await this.#dbusProxy.ListNamesAsync()
        const mprisPlayers = names.filter((dbusName) => dbusName.startsWith(this.#mprisPrefix));

        return mprisPlayers;
    }

    /**
     * Sanitize mpris dbus name
     * @param {string} dbusName
     * @returns {string}
     */
    #getAppName(dbusName) {
        return dbusName.replace(this.#mprisPrefix, "");
    }

    constructor(params) {
        super();

        if (!(params instanceof PrivateContructorParams)) {
            throw new TypeError(
                "MprisMediaPlayer2 is not constructable. " +
                "Use `MprisMediaPlayer2.Get()`."
            );
        }

        this.#DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
        this.#DBusPlayerProxy = Gio.DBusProxy.makeProxyWrapper(DBusMprisPlayerInterface);

        this.#dbusProxy = new this.#DBusProxy(
            Gio.DBus.session,
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            (/** @type {DBusMprisPlayerProxy} */ player) => this.#onPlayerChange(player),
        );

        this.#dbusProxy.connectSignal(
            'NameOwnerChanged',
            (...args) => this.#onNameOwnerChanged(...args),
        );


        // Declare some GObject.Object (non typescript has some difficulty with this weird import)
        if (!this.emit) this.emit = super.emit
        if (!this.connect) this.connect = super.connect
    }
}

/**
 * MprisPlayer singleton class.
 * Call MprisPlayer.Get()
 * @type { typeof _MprisPlayer }
 */
const MprisPlayer = GObject.registerClass({
    Signals: {
        'isPlaying': {
            param_types: [GObject.TYPE_BOOLEAN],
        },
    },
}, _MprisPlayer)

export { MprisPlayer }

// REMOVE THIS

const a = await MprisPlayer.Get();

a.connect('isPlaying',
    (...args) => console.log('example-signal emitted!', args));

await a.refresh();

let loop = new GLib.MainLoop(null, false);
loop.run();

