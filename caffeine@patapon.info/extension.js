/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
/* jshint multistr:true */
/* jshint esnext:true */
/* exported enable disable init */
/**
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

'use strict';

const { Atk, Gio, GObject, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const NIGHT_LIGHT_KEY = 'control-nightlight';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const ColorInterface = '<node> \
  <interface name="org.gnome.SettingsDaemon.Color"> \
    <property name="DisabledUntilTomorrow" type="b" access="readwrite"/>\
    <property name="NightLightActive" type="b" access="read"/>\
  </interface>\
  </node>';

const ColorProxy = Gio.DBusProxy.makeProxyWrapper(ColorInterface);

const DBusSessionManagerIface = '<node>\
  <interface name="org.gnome.SessionManager">\
    <method name="Inhibit">\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="u" direction="out" />\
    </method>\
    <method name="Uninhibit">\
        <arg type="u" direction="in" />\
    </method>\
       <method name="GetInhibitors">\
           <arg type="ao" direction="out" />\
       </method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
        <arg type="o" direction="out" />\
    </signal>\
  </interface>\
</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = '<node>\
  <interface name="org.gnome.SessionManager.Inhibitor">\
    <method name="GetAppId">\
        <arg type="s" direction="out" />\
    </method>\
  </interface>\
</node>';

const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const IndicatorName = 'Caffeine';
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';

const ControlNightLight = {
    NEVER: 0,
    ALWAYS: 1,
    FOR_APPS: 2,
};

let CaffeineIndicator;

const Caffeine = GObject.registerClass(
class Caffeine extends PanelMenu.Button {
    _init() {
        super._init(null, IndicatorName);

        this.accessible_role = Atk.Role.TOGGLE_BUTTON;

        this._settings = ExtensionUtils.getSettings();
        this._settings.connect(`changed::${SHOW_INDICATOR_KEY}`, () => {
            if (this._settings.get_boolean(SHOW_INDICATOR_KEY))
                this.show();
            else
                this.hide();
        });
        if (!this._settings.get_boolean(SHOW_INDICATOR_KEY))
            this.hide();

        this._proxy = new ColorProxy(Gio.DBus.session, 'org.gnome.SettingsDaemon.Color', '/org/gnome/SettingsDaemon/Color', (proxy, error) => {
            if (error)
                log(error.message);
        });

        this._night_light = false;

        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager');
        this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded', this._inhibitorAdded.bind(this));
        this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved', this._inhibitorRemoved.bind(this));

        // From auto-move-windows@gnome-shell-extensions.gcampax.github.com
        this._appSystem = Shell.AppSystem.get_default();

        this._appsChangedId =
            this._appSystem.connect('installed-changed',
                this._updateAppData.bind(this));

        // ("screen" in global) is false on 3.28, although global.screen exists
        if (typeof global.screen !== 'undefined') {
            this._screen = global.screen;
            this._display = this._screen.get_display();
        } else {
            this._screen = global.display;
            this._display = this._screen;
        }

        this._icon = new St.Icon({
            style_class: 'system-status-icon',
        });
        this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);

        this._state = false;
        // who has requested the inhibition
        this._last_app = '';
        this._last_cookie = '';
        this._apps = [];
        this._cookies = [];
        this._objects = [];

        this.add_actor(this._icon);
        this.add_style_class_name('panel-status-button');
        this.connect('button-press-event', this.toggleState.bind(this));
        this.connect('touch-event', this.toggleState.bind(this));

        // Restore user state
        if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY))
            this.toggleState();

        // Enable caffeine when fullscreen app is running
        if (this._settings.get_boolean(FULLSCREEN_KEY)) {
            this._inFullscreenId = this._screen.connect('in-fullscreen-changed', this.toggleFullscreen.bind(this));
            this.toggleFullscreen();
        }

        this._appConfigs = [];
        this._appData = new Map();

        this._settings.connect(`changed::${INHIBIT_APPS_KEY}`, this._updateAppConfigs.bind(this));
        this._updateAppConfigs();
    }

    get inFullscreen() {
        let nbMonitors = this._screen.get_n_monitors();
        let inFullscreen = false;
        for (let i = 0; i < nbMonitors; i++) {
            if (this._screen.get_monitor_in_fullscreen(i)) {
                inFullscreen = true;
                break;
            }
        }
        return inFullscreen;
    }

    toggleFullscreen() {
        Mainloop.timeout_add_seconds(2, () => {
            if (this.inFullscreen && !this._apps.includes('fullscreen')) {
                this.addInhibit('fullscreen');
                this._manageNightLight('disabled');
            }
        });

        if (!this.inFullscreen && this._apps.includes('fullscreen')) {
            this.removeInhibit('fullscreen');
            this._manageNightLight('enabled');
        }
    }

    toggleState() {
        if (this._state) {
            this._apps.forEach(appId => this.removeInhibit(appId));
            this._manageNightLight('enabled');
        } else {
            this.addInhibit('user');
            this._manageNightLight('disabled');
        }
    }

    addInhibit(appId) {
        this._sessionManager.InhibitRemote(appId,
            0, 'Inhibit by %s'.format(IndicatorName), 12,
            cookie => {
                this._last_cookie = cookie;
                this._last_app = appId;
            }
        );
    }

    removeInhibit(appId) {
        let index = this._apps.indexOf(appId);
        this._sessionManager.UninhibitRemote(this._cookies[index]);
    }

    _inhibitorAdded(proxy, sender, [object]) {
        this._sessionManager.GetInhibitorsRemote(([inhibitors]) => {
            for (let i of inhibitors) {
                let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                    'org.gnome.SessionManager',
                    i);
                inhibitor.GetAppIdRemote(appId => {
                    appId = String(appId);
                    if (appId !== '' && appId === this._last_app) {
                        if (this._last_app === 'user')
                            this._settings.set_boolean(USER_ENABLED_KEY, true);
                        this._apps.push(this._last_app);
                        this._cookies.push(this._last_cookie);
                        this._objects.push(object);
                        this._last_app = '';
                        this._last_cookie = '';
                        if (this._state === false) {
                            this._state = true;
                            this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${EnabledIcon}.svg`);
                            if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY) && !this.inFullscreen)
                                this._sendNotification('enabled');
                        }
                    }
                });
            }
        });
    }

    _inhibitorRemoved(proxy, sender, [object]) {
        let index = this._objects.indexOf(object);
        if (index !== -1) {
            if (this._apps[index] === 'user')
                this._settings.set_boolean(USER_ENABLED_KEY, false);
            // Remove app from list
            this._apps.splice(index, 1);
            this._cookies.splice(index, 1);
            this._objects.splice(index, 1);
            if (this._apps.length === 0) {
                this._state = false;
                this._icon.gicon = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);
                if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY))
                    this._sendNotification('disabled');
            }
        }
    }

    _manageNightLight(state) {
        const controlNl = this._settings.get_enum(NIGHT_LIGHT_KEY) === ControlNightLight.ALWAYS;
        if (state === 'enabled') {
            if (controlNl && this._proxy.NightLightActive) {
                this._proxy.DisabledUntilTomorrow = false;
                this._night_light = true;
            } else {
                this._night_light = false;
            }
        }
        if (state === 'disabled') {
            if (controlNl && this._proxy.NightLightActive) {
                this._proxy.DisabledUntilTomorrow = true;
                this._night_light = true;
            } else {
                this._night_light = false;
            }
        }
    }

    _sendNotification(state) {
        const controllingNl = this._settings.get_enum(NIGHT_LIGHT_KEY) !== ControlNightLight.NEVER;
        if (state === 'enabled') {
            if (controllingNl && this._night_light && this._proxy.DisabledUntilTomorrow)
                Main.notify(_('Auto suspend and screensaver disabled. Night Light paused.'));
            else
                Main.notify(_('Auto suspend and screensaver disabled'));
        }
        if (state === 'disabled') {
            if (controllingNl && this._night_light && !this._proxy.DisabledUntilTomorrow)
                Main.notify(_('Auto suspend and screensaver enabled. Night Light resumed.'));
            else
                Main.notify(_('Auto suspend and screensaver enabled'));
        }
    }

    _updateAppConfigs() {
        this._appConfigs.length = 0;
        this._settings.get_strv(INHIBIT_APPS_KEY).forEach(appId => {
            this._appConfigs.push(appId);
        });
        this._updateAppData();
    }

    _updateAppData() {
        let ids = this._appConfigs.slice();
        let removedApps = [...this._appData.keys()]
            .filter(a => !ids.includes(a.id));
        removedApps.forEach(app => {
            app.disconnect(this._appData.get(app).windowsChangedId);
            this._appData.delete(app);
        });
        let addedApps = ids
            .map(id => this._appSystem.lookup_app(id))
            .filter(app => app && !this._appData.has(app));
        addedApps.forEach(app => {
            let data = {
                windowsChangedId: app.connect('windows-changed',
                    this._appWindowsChanged.bind(this)),
            };
            this._appData.set(app, data);
        });
    }

    _appWindowsChanged(app) {
        let appId = app.get_id();
        let appState = app.get_state();
        if (appState !== Shell.AppState.STOPPED) {
            this.addInhibit(appId);
            if (this._settings.get_enum(NIGHT_LIGHT_KEY) > ControlNightLight.NEVER && this._proxy.NightLightActive) {
                this._proxy.DisabledUntilTomorrow = true;
                this._night_light = true;
            } else {
                this._night_light = false;
            }
        } else {
            this.removeInhibit(appId);
            if (this._settings.get_enum(NIGHT_LIGHT_KEY) > ControlNightLight.NEVER && this._proxy.NightLightActive) {
                this._proxy.DisabledUntilTomorrow = false;
                this._night_light = true;
            } else {
                this._night_light = false;
            }
        }
    }

    destroy() {
        // remove all inhibitors
        this._apps.forEach(appId => this.removeInhibit(appId));
        // disconnect from signals
        if (this._settings.get_boolean(FULLSCREEN_KEY))
            this._screen.disconnect(this._inFullscreenId);
        if (this._inhibitorAddedId) {
            this._sessionManager.disconnectSignal(this._inhibitorAddedId);
            this._inhibitorAddedId = 0;
        }
        if (this._inhibitorRemovedId) {
            this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
            this._inhibitorRemovedId = 0;
        }
        if (this._windowCreatedId) {
            this._display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
        if (this._windowDestroyedId) {
            global.window_manager.disconnect(this._windowDestroyedId);
            this._windowDestroyedId = 0;
        }
        if (this._appsChangedId) {
            this._appSystem.disconnect(this._appsChangedId);
            this._appsChangedId = 0;
        }
        this._appConfigs.length = 0;
        this._updateAppData();
        super.destroy();
    }
});

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    // Migrate old nightlight settings
    const _settings = ExtensionUtils.getSettings();
    const controlNightLight = _settings.get_value('control-nightlight');
    const controlNightLightForApp = _settings.get_value('control-nightlight-for-app');
    if (controlNightLight.unpack() === true) {
        let nightlightControl = ControlNightLight.ALWAYS;
        if (controlNightLightForApp.unpack() === true)
            nightlightControl = ControlNightLight.FOR_APPS;
        _settings.set_enum('nightlight-control', nightlightControl);
    }
    // remove deprecated settings
    _settings.reset('control-nightlight');
    _settings.reset('control-nightlight-for-app');

    CaffeineIndicator = new Caffeine();
    Main.panel.addToStatusArea(IndicatorName, CaffeineIndicator);
}

function disable() {
    CaffeineIndicator.destroy();
    CaffeineIndicator = null;
}
