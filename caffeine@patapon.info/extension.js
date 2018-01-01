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

const Clutter = imports.gi.Clutter;
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
	<method name="GetInhibitors">\
	    <arg type="ao" direction="out" />\
	</method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
	    <arg type="o" />\
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
const DisabledIcon = {'app': 'my-caffeine-off-symbolic', 'user': 'my-caffeine-off-symbolic-user'};
const EnabledIcon = {'app': 'my-caffeine-on-symbolic', 'user': 'my-caffeine-on-symbolic-user'};

let CaffeineIndicator;
let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

const Caffeine = new Lang.Class({
    Name: IndicatorName,
    Extends: PanelMenu.Button,

    _init: function(metadata, params) {
    	this._mode = 'app';
        this._state = false;
        this._apps = [];
        this._cookies = [];
        
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
        this._windowCreatedId = global.screen.get_display().connect_after('window-created', Lang.bind(this, this._mayInhibit));
        this._windowDestroyedId = global.window_manager.connect('destroy', Lang.bind(this, this._mayUninhibit));

        let icon_name = DisabledIcon['app'];
        if (this._settings.get_boolean(USER_ENABLED_KEY))
        	icon_name = DisabledIcon['user'];
        	
        this._icon = new St.Icon({
            icon_name: icon_name,
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');
        this.actor.connect('button-press-event', Lang.bind(this, this.toggleState));
        this.actor.connect_after('key-release-event', Lang.bind(this, function (actor, event) {
        	let symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_Return || symbol == Clutter.KEY_space) {
            	this.toggleState();
            }
        }));

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
            this._mayInhibit(global.screen.get_display(), window.meta_window, true);
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
    
    toggleIcon: function(state) {
    	if (this._settings.get_boolean(USER_ENABLED_KEY) && this._mode == 'app') return; // handle by user
    	if (state === false) {
        	if (this.inFullscreen && this._state) return; // auto suspend already disabled
        	
            this._state = true;
            if (this._settings.get_boolean(USER_ENABLED_KEY))
            	this._icon.icon_name = EnabledIcon['user'];
            else this._icon.icon_name = EnabledIcon['app'];
            if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY) && !this.inFullscreen)
                Main.notify(_("Auto suspend and screensaver disabled"));
        } else {
        	if (!this.inFullscreen && !this._state) return; // auto suspend already enabled
        	
        	this._state = false;
            if (this._settings.get_boolean(USER_ENABLED_KEY))
            	this._icon.icon_name = DisabledIcon['user'];
            else this._icon.icon_name = DisabledIcon['app'];
            if(this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY))
                Main.notify(_("Auto suspend and screensaver enabled"));
        }
    },
    
    toggleUserFlag: function(state) {
    	this._settings.set_boolean(USER_ENABLED_KEY, state);
    },
    
    toggleFullscreen: function(test_obj1, test_obj2) {
        let app_index = this._apps.indexOf('fullscreen');
        Mainloop.timeout_add_seconds(2, Lang.bind(this, function() {
            let inFullscreen = this.inFullscreen;
            if (inFullscreen && app_index == -1) {
            	this.addInhibit('fullscreen');
            }else if (!inFullscreen && app_index != -1) {
            	this.removeInhibit('fullscreen');
            }
        }));
    },
    
    doApp: function(act, index, app_id, cookie) {
    	switch(act) {
    	case 'add':
            this._apps.push(app_id);
            this._cookies.push(cookie);
    		break;
    	case 'remove':
    		this._apps.splice(index, 1);
            this._cookies.splice(index, 1);
    		break;
    	default:
    		log("Warning: ", act, " undefined!");
    		break;
    	}
    },

    addInhibit: function(app_id) {
        this._sessionManager.InhibitRemote(app_id,
            0, "Inhibit by %s".format(IndicatorName), 12,
            Lang.bind(this, function(cookie) {
            	this.doApp('add', 0, app_id, cookie);
            })
        );
    },

    removeInhibit: function(app_id) {
        let index = this._apps.indexOf(app_id);
        if (index == -1)  return;
        var cookie_remove = this._cookies[index];
        this._mode = 'app';

        if (this._apps[index] == 'user') {
        	this._mode = 'user';
        	this.toggleUserFlag(false);
        }
    	this.doApp('remove', index);
        
        this._sessionManager.UninhibitRemote(cookie_remove);
    },

    _inhibitorAdded: function(proxy, sender, [object]) {
        this._sessionManager.GetInhibitorsRemote(Lang.bind(this, function([inhibitors]){
        	if (!this._apps.length) return; // no app to handle

            let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                                                         'org.gnome.SessionManager',
                                                         object);
            inhibitor.GetAppIdRemote(Lang.bind(this, function(app_id) {
            	if (app_id == "") return;
            	
            	this._mode = 'app';
                if (app_id == 'user'){
                	this._mode = 'user';
                	this.toggleUserFlag(true);
                }
                this.toggleIcon(false); // disable auto suspend
            }));
        }));
    },
    
    _inhibitorRemoved: function(proxy, sender, [object]) {
        this.toggleIcon(true); // enable auto suspend
    },

    _mayInhibit: function(display, window, noRecurse) {
    	let app = Shell.WindowTracker.get_default().get_window_app(window);
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
        let app = Shell.WindowTracker.get_default().get_window_app(actor.meta_window);
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
        if (this._settings.get_boolean(FULLSCREEN_KEY)){
            global.screen.disconnect(this._inFullscreenId);
        }
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
