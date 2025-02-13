// @ts-check
// @ts-expect-error
import Gio from "gi://Gio";
// @ts-expect-error
import GObject from "gi://GObject";

("use strict");

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
    dont = "doit";
}

// ======================

class _MprisPlayer extends GObject.Object {
    /**
     * @type {_MprisPlayer | undefined}
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
        return this.#instance;
    }

    static Destroy() {
        if (this.#instance) this.#instance.#onDestroy();
        this.#instance = undefined;
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

    /**
     * @readonly
     * @type {any}
     */
    #dbusHandlerId;

    #mprisPrefix = "org.mpris.MediaPlayer2.";

    /**
     * All players with player dbusProxy instance
     * @type {Map<string, { handlerId: number, playerProxy: DBusMprisPlayerProxy }>}
     */
    #activePlayers = new Map();

    #isPlaying = false;
    get isPlaying() {
        return this.#isPlaying;
    }

    #lastEmittedPlayStatus = false;

    async #init() {
        await this.refresh();
    }

    async refresh() {
        const dbusNames = await this.#getMPlayerApps();
        dbusNames.forEach((dbusName) => this.#addPlayer(dbusName));
        this.#emitPlayStatus(true);
    }

    #emitPlayStatus(forceEmit = false) {
        if (this.#lastEmittedPlayStatus === this.isPlaying && !forceEmit) return;
        this.#lastEmittedPlayStatus = this.isPlaying;
        this.emit("isPlaying", this.isPlaying);
    }

    /**
     * @param {string} dbusName
     */
    #addPlayer(dbusName) {
        if (this.#activePlayers.has(dbusName)) return;

        const dbusPlayerProxy = new this.#DBusPlayerProxy(
            Gio.DBus.session,
            dbusName,
            "/org/mpris/MediaPlayer2",
            (_player) => this.#onPlayerChange()
        );

        const handlerId = dbusPlayerProxy.connect(
            "g-properties-changed",
            (_player) => this.#onPlayerChange()
        );

        this.#activePlayers.set(dbusName, {
            handlerId,
            playerProxy: dbusPlayerProxy,
        });
    }

    /**
     * @param {string} dbusName
     */
    #removePlayer(dbusName) {
        const player = this.#activePlayers.get(dbusName);
        if (!player) return;
        player.playerProxy.disconnect(player.handlerId);
        this.#activePlayers.delete(dbusName);
    }

    #onPlayerChange() {
        let isPlaying = false;
        for (const player of this.#activePlayers.values()) {
            if (player.playerProxy.PlaybackStatus === "Playing") isPlaying = true;
        }
        this.#isPlaying = isPlaying;
        this.#emitPlayStatus();
    }

    #onNameOwnerChanged(_proxy, _sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(this.#mprisPrefix)) return;
        if (oldOwner && !newOwner) this.#removePlayer(name);
        if (newOwner && !oldOwner) this.#addPlayer(name);
        this.#onPlayerChange();
    }

    /**
     * Get the dbus name list for mpris players
     * @returns {Promise<string[]>}
     */
    async #getMPlayerApps() {
        const [names] = await this.#dbusProxy.ListNamesAsync();
        const mprisPlayers = names.filter((dbusName) =>
            dbusName.startsWith(this.#mprisPrefix)
        );

        return mprisPlayers;
    }

    #onDestroy() {
        this.#dbusProxy.disconnectSignal(this.#dbusHandlerId);
        for (const dbusName of this.#activePlayers.keys()) {
            this.#removePlayer(dbusName);
        }
        this.#activePlayers.clear();
    }

    /**
     * @param {any} params
     */
    constructor(params) {
        super();
        // Declare some GObject.Object (non typescript has some difficulty with this weird import)
        if (!this.emit) this.emit = super.emit;
        if (!this.connect) this.connect = super.connect;

        if (!(params instanceof PrivateContructorParams)) {
            throw new TypeError(
                "MprisMediaPlayer2 is not constructable. " +
                "Use `MprisMediaPlayer2.Get()` and `MprisMediaPlayer2.Destroy()`"
            );
        }

        this.#DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
        this.#DBusPlayerProxy = Gio.DBusProxy.makeProxyWrapper(
            DBusMprisPlayerInterface
        );

        this.#dbusProxy = new this.#DBusProxy(
            Gio.DBus.session,
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            (_proxy) => this.#onPlayerChange()
        );

        this.#dbusHandlerId = this.#dbusProxy.connectSignal(
            "NameOwnerChanged",
            (...args) => this.#onNameOwnerChanged(...args)
        );
    }
}

/**
 * MprisPlayer singleton class.
 * Call `await MprisPlayer.Get()` & `MprisPlayer.Destroy()`.
 * @type { typeof _MprisPlayer }
 */
const MprisPlayer = GObject.registerClass(
    {
        Signals: {
            isPlaying: {
                param_types: [GObject.TYPE_BOOLEAN],
            },
        },
    },
    _MprisPlayer
);

export { MprisPlayer };
