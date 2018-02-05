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
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;
const Shell = imports.gi.Shell;
const MessageTray = imports.ui.messageTray;
const Atk = imports.gi.Atk;
const Config = imports.misc.config;

// below are default inhibit flags
const INHIBIT_LOGOUT = 1; // logging out
const INHIBIT_SWITCH = 2; // switching user
const INHIBIT_SUSPEND = 4; // well, weird value, seems got it while playing audio stream only
const INHIBIT_IDLE = 8; // playing, for fullscreen: 4 + 8
const INHIBIT_AUTO_MOUNT = 16; // auto-mouting media

// mask for inhibit flags
//const MASK_SUSPEND_DISABLE_INHIBIT = INHIBIT_SUSPEND | INHIBIT_IDLE | INHIBIT_AUTO_MOUNT;
const MASK_SUSPEND_DISABLE_INHIBIT = INHIBIT_IDLE | INHIBIT_AUTO_MOUNT;
const MASK_SUSPEND_ENABLE_INHIBIT =  INHIBIT_LOGOUT | INHIBIT_SWITCH;

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const ADDRESS_INHIBITOR_KEY = 'address-inhibitor';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine-plus');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Menu = Me.imports.menu;
const Window = Me.imports.window;
const Inhibitor = Me.imports.inhibitor;


const IndicatorName = "Caffeine";
const enableSuspendIcon = {'app': 'my-caffeine-off-symbolic', 'user': 'my-caffeine-off-symbolic-user'};
const disableSuspendIcon = {'app': 'my-caffeine-on-symbolic', 'user': 'my-caffeine-on-symbolic-user'};


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

        Inhibitor.init(this);
        this.inhibitor = Inhibitor;
        Window.init(this);
        this.window = Window;

        let icon_name = enableSuspendIcon['app'];
        if (this._settings.get_boolean(USER_ENABLED_KEY))
        	icon_name = enableSuspendIcon['user'];
        	
        this._icon = new St.Icon({
            icon_name: icon_name,
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');

        // Restore user state
    	if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY)) {
        	this._settings.set_boolean(USER_ENABLED_KEY, false);
            this.userToggleState();
        } else {
        	this._settings.set_boolean(USER_ENABLED_KEY, false);
        }

        Menu.init(this);
    },
    
    userToggleState: function() {
    	this._settings.set_boolean(USER_ENABLED_KEY, !this._settings.get_boolean(USER_ENABLED_KEY));
    	
        if (!this._settings.get_boolean(USER_ENABLED_KEY)) {
        	this.inhibitor.remove('user');
        }
        else {
        	let reason = "Inhibit by %s globally".format(IndicatorName);
            this.inhibitor.add('user', reason);
        }
    },

    destroy: function() {
//        // remove all inhibitors created by caffeine
//    	for (var inhibitor in this._inhibitors)
//    		this.removeInhibit(inhibitor["app_id"]);
//        // disconnect from signals
//        if (this._settings.get_boolean(FULLSCREEN_KEY)){
//            global.screen.disconnect(this._inFullscreenId);
//        }
//        if (this._inhibitorAddedId) {
//            this._sessionManager.disconnectSignal(this._inhibitorAddedId);
//            this._inhibitorAddedId = 0;
//        }
//        if (this._inhibitorRemovedId) {
//            this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
//            this._inhibitorRemovedId = 0;
//        }
//        if (this._windowCreatedId) {
//            global.screen.get_display().disconnect(this._windowCreatedId);
//            this._windowCreatedId = 0;
//        }
//        if (this._windowDestroyedId) {
//            global.window_manager.disconnect(this._windowDestroyedId);
//            this._windowDestroyedId = 0;
//        }
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