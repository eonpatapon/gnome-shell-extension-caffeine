import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// @ts-check
'use strict';

const DBusInterface = `<node>
    <interface name="org.freedesktop.DBus">
        <method name="ListNames">
            <arg type="as" direction="out" />
        </method>
    </interface>
</node>`;

const DBusPlayerInterface = '<node> \
  <interface name="org.mpris.MediaPlayer2.Player"> \
    <property name="PlaybackStatus" type="s" access="read"/>\
  </interface>\
</node>';

class MprisMediaPlayer2 {

    /** @readonly */ #DBusProxy;
    /** @readonly */ #DBusPlayerProxy;

    /**
     * Represents the DBus proxy.
     * @readonly
     * @type {{
     *  ListNamesRemote(callbackFn: (data: [string[]]) => never): never;
     *  ListNamesSync(): [string[]];
     * }}
    */
    #dbusProxy;

    #activePlayers = new Map();

    /**
     * Get the dbus name list filter on MPlayer
     * @returns {Promise<string[]>}
     */
    getMPlayerApps() {
        return new Promise((resolve => {
            this.#dbusProxy.ListNamesRemote((dbusList) => {

                const mplayerEntries = dbusList
                    .flat()
                    .filter((dbusName) => dbusName.startsWith("org.mpris.MediaPlayer2."));

                resolve(mplayerEntries);
            });
        }));
    }

    /**
     * Get the MPlayer2 status via dbus name
     * @param {string} dbusName
     * @returns {Promise<string>}
     */
    getMPlayerAppPlaybackStatus(dbusName) {
        return new Promise((resolve => {
            new this.#DBusPlayerProxy(
                Gio.DBus.session,
                dbusName,
                "/org/mpris/MediaPlayer2",
                (playStatus) => resolve(playStatus.PlaybackStatus)
            );
        }));
    }

    constructor() {
        this.#DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusInterface);
        this.#dbusProxy = new this.#DBusProxy(
            Gio.DBus.session,
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus"
        );
        
        this.#DBusPlayerProxy = Gio.DBusProxy.makeProxyWrapper(DBusPlayerInterface);

        this.getMPlayerApps()
            .then(async mplayerApps => {
                console.log(mplayerApps);

                const playStatus = await Promise.all(
                    mplayerApps.map(mplayerApp => this.getMPlayerAppPlaybackStatus(mplayerApp))
                );

                console.log(playStatus);
            })
            .catch(error => console.error(error));
    }
}

const a = new MprisMediaPlayer2();

let loop = new GLib.MainLoop(null, false);
loop.run();
