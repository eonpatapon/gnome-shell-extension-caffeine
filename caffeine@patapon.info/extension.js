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
        this.parent(null, IndicatorName, false);

        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
                                                          'org.gnome.SessionManager',
                                                          '/org/gnome/SessionManager');
        this._sessionManager.connectSignal('InhibitorAdded',
                                           Lang.bind(this, this._inhibitorAdded));
        this._sessionManager.connectSignal('InhibitorRemoved',
                                           Lang.bind(this, this._inhibitorRemoved));

        this._icon = new St.Icon({
            icon_name: DisabledIcon,
            style_class: 'system-status-icon'
        });

        this._state = false;
        this._object = false;
        this._cookie = "";

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');
        this.actor.connect('button-press-event', Lang.bind(this, this.toggleState));
    },

    toggleState: function() {
        if (this._state)
            this.removeInhibit();
        else
            this.addInhibit();
    },

    addInhibit: function() {
        this._sessionManager.InhibitRemote(IndicatorName,
            0, "Inhibit by %s".format(IndicatorName), 8,
            Lang.bind(this, function(cookie) {
                this._cookie = cookie;
            })
        );
    },

    removeInhibit: function() {
        if (this._cookie)
            this._sessionManager.UninhibitRemote(this._cookie);
        else
            log("Can't uninhibit. Cookie not available.");
    },

    _inhibitorAdded: function(proxy, sender, [object]) {
        let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                                                             'org.gnome.SessionManager',
                                                             object);
        this._added_object = object;

        // Is the new inhibitor Caffeine ?
        inhibitor.GetAppIdRemote(Lang.bind(this, function(app_id) {
            if (app_id == IndicatorName) {
                this._icon.icon_name = EnabledIcon;
                this._state = true;
                this._object = this._added_object;
            }
        }));
    },

    _inhibitorRemoved: function(proxy, sender, [object]) {
        if (object == this._object) {
            this._icon.icon_name = DisabledIcon;
            this._state = false;
            this._object = false;
            this._cookie = "";
        }
    },

    destroy: function() {
        this.removeInhibit();
        this.parent();
    }
});

function init(extensionMeta) {
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
