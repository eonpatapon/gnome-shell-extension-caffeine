/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
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

const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;
const MessageTray = imports.ui.messageTray;
const Atk = imports.gi.Atk;

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Me.imports.lib;

const DBusSessionManagerIface = <interface name="org.gnome.SessionManager">
<method name="Inhibit">
    <arg type="s" direction="in" />
    <arg type="u" direction="in" />
    <arg type="s" direction="in" />
    <arg type="u" direction="in" />
    <arg type="u" direction="out" />
</method>
<method name="Uninhibit">
    <arg type="u" direction="in" />
</method>
<signal name="InhibitorAdded">
    <arg type="o" direction="out" />
</signal>
<signal name="InhibitorRemoved">
    <arg type="o" direction="out" />
</signal>
</interface>;
const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = <interface name="org.gnome.SessionManager.Inhibitor">
<method name="GetAppId">
    <arg type="s" direction="out" />
</method>
</interface>;
const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const IndicatorName = "Caffeine";
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';

let CaffeineIndicator;

const Caffeine = new Lang.Class({
    Name: IndicatorName,
    Extends: PanelMenu.Button,

    _init: function(metadata, params) {
        this.parent(null, IndicatorName);
        this.actor.accessible_role = Atk.Role.TOGGLE_BUTTON;

        this._settings = Lib.getSettings(Me);
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
        this._object = false;
        this._cookie = "";
        // who has requested the inhibition
        this._current_requestor = "";
        this._requestors = [];

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');
        this.actor.connect('button-press-event', Lang.bind(this, this.toggleState));

        // Fake menu
        this.menu.open = Lang.bind(this, this._onMenuOpenRequest);
        this.menu.close = Lang.bind(this, this._onMenuCloseRequest);
        this.menu.toggle = Lang.bind(this, this._onMenuToggleRequest);
    },

    _onMenuOpenRequest: function() {
        this.menu.isOpen = true;
        this.menu.emit('open-state-changed', true);
    },

    _onMenuCloseRequest: function() {
        this.menu.isOpen = false;
        this.menu.emit('open-state-changed', false);
    },

    _onMenuToggleRequest: function() {
        this.menu.isOpen = !this.menu.isOpen;
        this.menu.emit('open-state-changed', this.menu.isOpen);
    },

    toggleState: function() {
        if (this._state) {
            this._requestors = [];
            this.removeInhibit();
        }
        else
            this.addInhibit('user');
    },

    addInhibit: function(requestor) {
        this._sessionManager.InhibitRemote(IndicatorName,
            0, "Inhibit by %s".format(IndicatorName), 8,
            Lang.bind(this, function(cookie) {
                this._cookie = cookie;
                this._current_requestor = requestor;
            })
        );
    },

    removeInhibit: function() {
        this._sessionManager.UninhibitRemote(this._cookie);
    },

    _inhibitorAdded: function(proxy, sender, [object]) {
        let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                                                             'org.gnome.SessionManager',
                                                             object);
        // Is the new inhibitor Caffeine ?
        inhibitor.GetAppIdRemote(Lang.bind(this, function(app_id) {
            if (app_id == IndicatorName) {
                this._icon.icon_name = EnabledIcon;
                this._state = true;
                this._object = object;
                this._requestors.push(this._current_requestor);
                this._current_requestor = "";
                if(this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY))
                    Main.notify(_("Caffeine enabled"));
            }
        }));
    },

    _inhibitorRemoved: function(proxy, sender, [object]) {
        if (object == this._object) {
            this._icon.icon_name = DisabledIcon;
            this._state = false;
            this._object = false;
            this._cookie = "";
            if(this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY))
                Main.notify(_("Caffeine disabled"));
        }
    },

    _mayInhibit: function(display, window, noRecurse) {
        if (!this._windowTracker.is_window_interesting(window))
            return;

        let app = this._windowTracker.get_window_app(window);
        if (!app) {
            if (!noRecurse) {
                // window is not tracked yet
                Mainloop.idle_add(Lang.bind(this, function() {
                    this._mayInhibit(display, window, true);
                    return false;
                }));
            } else
                log('Cannot find application for window');
            return;
        }
        let apps = this._settings.get_strv(INHIBIT_APPS_KEY);
        if (apps.indexOf(app.get_id()) != -1 && !this._state)
            this.addInhibit(window);
    },

    _mayUninhibit: function(shellwm, actor) {
        let window = actor.meta_window;
        // remove the requestor from the list
        let index = this._requestors.indexOf(window);
        if (index > -1)
            this._requestors.splice(index, 1);
        if (this._requestors.length == 0 && this._state)
            this.removeInhibit();
    },

    destroy: function() {
        this.removeInhibit();
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
    Lib.initTranslations(Me);
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
