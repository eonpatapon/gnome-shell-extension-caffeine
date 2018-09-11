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
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Atk = imports.gi.Atk;
const Config = imports.misc.config;

const SHOW_INDICATOR_KEY = 'show-indicator';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine-plus');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Func = Me.imports.func;
const Convenience = Me.imports.convenience;
const Menu = Me.imports.menu;
const Window = Me.imports.window;
const Inhibitor = Me.imports.inhibitor;


const IndicatorName = "Caffeine Plus";
const enableSuspendIcon = {'app': 'my-caffeine-off-symbolic', 'user': 'my-caffeine-off-symbolic-user'};
const disableSuspendIcon = {'app': 'my-caffeine-on-symbolic', 'user': 'my-caffeine-on-symbolic-user'};


let CaffeineIndicator;

const Caffeine = new Lang.Class({
    Name: IndicatorName,
    Extends: PanelMenu.Button,

    _init: function(metadata, params) {
        this.parent(null, IndicatorName);
        this.actor.accessible_role = Atk.Role.TOGGLE_BUTTON;
        this.func = Func;

        this._settings = Convenience.getSettings();
        this._settings.connect("changed::" + SHOW_INDICATOR_KEY, Lang.bind(this, function() {
            if (this._settings.get_boolean(SHOW_INDICATOR_KEY))
                this.actor.show();
            else
                this.actor.hide();
        }));
        if (!this._settings.get_boolean(SHOW_INDICATOR_KEY))
            this.actor.hide();

        let icon_name = enableSuspendIcon['app'];
        if (this._settings.get_boolean(USER_ENABLED_KEY))
        	icon_name = enableSuspendIcon['user'];
        	
        this._icon = new St.Icon({
            icon_name: icon_name,
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(this._icon);
        this.actor.add_style_class_name('panel-status-button');

        Inhibitor.init(this);
        this.inhibitor = Inhibitor;
        
        Window.init(this);
        this.window = Window;

        // Restore user state
    	if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY)) {
        	this._settings.set_boolean(USER_ENABLED_KEY, false);
            this.userToggleState();
        } else {
        	this._settings.set_boolean(USER_ENABLED_KEY, false);
        }

        Menu.init(this);
    },
    
    getName: function() {
    	return IndicatorName;
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

    toggleIcon: function() {
    	if (this.inhibitor.isInhibited()) { // auto suspend keeping disabled
    		let icon_name = disableSuspendIcon['app'];
    		if (this._settings.get_boolean(USER_ENABLED_KEY))
    			icon_name = disableSuspendIcon['user'];
    		
    		this._icon.icon_name = icon_name;
    		return;
    	}
    	this._icon.icon_name = enableSuspendIcon['app'];
    },

    destroy: function() {
    	this.window.kill();
    	this.inhibitor.kill();
    	Menu.kill();
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