/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
/*jshint multistr:true */
/*jshint esnext:true */
/*global imports: true */
/*global global: true */
/*global log: true */
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

const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;
const MessageTray = imports.ui.messageTray;
const Atk = imports.gi.Atk;
const Config = imports.misc.config;

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

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

const IndicatorName = "Caffeine";
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';

let CaffeineIndicator;
let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

const Caffeine = new Lang.Class({
    Name: IndicatorName,
    Extends: PanelMenu.Button,

    _init: function(metadata, params) {
        this.parent(null, IndicatorName);
        this.actor.accessible_role = Atk.Role.TOGGLE_BUTTON;

        this._settings = Convenience.getSettings();
        this._settings.connect("changed::" + SHOW_INDICATOR_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(SHOW_INDICATOR_KEY))
                this.actor.show();
            else
                this.actor.hide();
        }));
        if (!this._settings.get_boolean(SHOW_INDICATOR_KEY))
            this.actor.hide();

        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
                                                          'org.gnome.SessionManager',
                                                          '/org/gnome/SessionManager');
        this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded',
                                                                    Lang.bind(this, this._inhibitorAdded));
        this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved',
                                                                      Lang.bind(this, this._inhibitorRemoved));

        // From auto-move-windows@gnome-shell-extensions.gcampax.github.com
        this._windowTracker = Shell.WindowTracker.get_default();
        let display = global.screen.get_display();
        // Connect after so the handler from ShellWindowTracker has already run
        this._windowCreatedId = display.connect_after('window-created', Lang.bind(this, this._mayInhibit));
        let shellwm = global.window_manager;
        this._windowDestroyedId = shellwm.connect('destroy', Lang.bind(this, this._mayUninhibit));

        this._icon = new St.Icon({
            icon_name: DisabledIcon,
            style_class: 'system-status-icon'
        });

        this._state = false;
        // who has requested the inhibition
        this._last_app = "";
        this._last_cookie = "";
        this._apps = [];
        this._cookies = [];
        this._objects = [];

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');
        this.actor.connect('button-press-event', Lang.bind(this, this.toggleState));

        // Restore user state
        if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY)) {
            this.toggleState();
        }
        // Enable caffeine when fullscreen app is running
        if (this._settings.get_boolean(FULLSCREEN_KEY)) {
            this._inFullscreenId = global.screen.connect('in-fullscreen-changed', Lang.bind(this, this.toggleFullscreen));
            this.toggleFullscreen();
        }
        // List current windows to check if we need to inhibit
        global.get_window_actors().map(Lang.bind(this, function(window) {
            this._mayInhibit(null, window.meta_window, null);
        }));
    },

    get inFullscreen() {
        let nb_monitors = global.screen.get_n_monitors();
        let inFullscreen = false;
        for (let i=0; i<nb_monitors; i++) {
            if (global.screen.get_monitor_in_fullscreen(i)) {
                inFullscreen = true;
                break;
            }
        }
        return inFullscreen;
    },

    toggleFullscreen: function() {
        Mainloop.timeout_add_seconds(2, Lang.bind(this, function() {
          if (this.inFullscreen && this._apps.indexOf('fullscreen') == -1) {
              this.addInhibit('fullscreen');
          }
        }));

        if (!this.inFullscreen && this._apps.indexOf('fullscreen') != -1) {
              this.removeInhibit('fullscreen');
        }
    },

    toggleState: function() {
        if (this._state) {
            this._apps.map(Lang.bind(this, function(app_id) {
                this.removeInhibit(app_id);
            }));
        }
        else {
            this.addInhibit('user');
        }
    },

    addInhibit: function(app_id) {
        this._sessionManager.InhibitRemote(app_id,
            0, "Inhibit by %s".format(IndicatorName), 12,
            Lang.bind(this, function(cookie) {
                this._last_cookie = cookie;
                this._last_app = app_id;
            })
        );
    },

    removeInhibit: function(app_id) {
        let index = this._apps.indexOf(app_id);
        this._sessionManager.UninhibitRemote(this._cookies[index]);
    },

    _inhibitorAdded: function(proxy, sender, [object]) {
        let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                                                             'org.gnome.SessionManager',
                                                             object);
        // Is the new inhibitor Caffeine ?
        inhibitor.GetAppIdRemote(Lang.bind(this, function(app_id) {
            if (app_id == this._last_app) {
                if (this._last_app == 'user')
                    this._settings.set_boolean(USER_ENABLED_KEY, true);
                this._apps.push(this._last_app);
                this._cookies.push(this._last_cookie);
                this._objects.push(object);
                this._last_app = "";
                this._last_cookie = "";
                if (this._state === false) {
                    this._state = true;
                    this._icon.icon_name = EnabledIcon;
                    if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY) && !this.inFullscreen)
                        Main.notify(_("Auto suspend and screensaver disabled"));
                }
            }
        }));
    },

    _inhibitorRemoved: function(proxy, sender, [object]) {
        let index = this._objects.indexOf(object);
        if (index != -1) {
            if (this._apps[index] == 'user')
                this._settings.set_boolean(USER_ENABLED_KEY, false);
            // Remove app from list
            this._apps.splice(index, 1);
            this._cookies.splice(index, 1);
            this._objects.splice(index, 1);
            if (this._apps.length === 0) {
                this._state = false;
                this._icon.icon_name = DisabledIcon;
                if(this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY))
                    Main.notify(_("Auto suspend and screensaver enabled"));
            }
        }
    },

    _mayInhibit: function(display, window, noRecurse) {
        let app = this._windowTracker.get_window_app(window);
        if (!app) {
            if (!noRecurse) {
                // window is not tracked yet
                Mainloop.idle_add(Lang.bind(this, function() {
                    this._mayInhibit(display, window, true);
                    return false;
                }));
            }
            return;
        }
        let app_id = app.get_id();
        let apps = this._settings.get_strv(INHIBIT_APPS_KEY);
        if (apps.indexOf(app_id) != -1)
            this.addInhibit(app_id);
    },

    _mayUninhibit: function(shellwm, actor) {
        let window = actor.meta_window;
        let app = this._windowTracker.get_window_app(window);
        if (app) {
            let app_id = app.get_id();
            if (this._apps.indexOf(app_id) != -1)
                this.removeInhibit(app_id);
        }
    },

    destroy: function() {
        // remove all inhibitors
        this._apps.map(Lang.bind(this, function(app_id) {
            this.removeInhibit(app_id);
        }));
        // disconnect from signals
        if (this._settings.get_boolean(FULLSCREEN_KEY))
            global.screen.disconnect(this._inFullscreenId);
        if (this._inhibitorAddedId) {
            this._sessionManager.disconnectSignal(this._inhibitorAddedId);
            this._inhibitorAddedId = 0;
        }
        if (this._inhibitorRemovedId) {
            this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
            this._inhibitorRemovedId = 0;
        }
        if (this._windowCreatedId) {
            global.screen.get_display().disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
        if (this._windowDestroyedId) {
            global.window_manager.disconnect(this._windowDestroyedId);
            this._windowDestroyedId = 0;
        }
        this.parent();
    }
});

function init(extensionMeta) {
    Convenience.initTranslations();
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(extensionMeta.path + "/icons");
}

function enable() {
    CaffeineIndicator = new Caffeine();
    Main.panel.addToStatusArea(IndicatorName, CaffeineIndicator);
}

function disable() {
    CaffeineIndicator.destroy();
    CaffeineIndicator = null;
}
