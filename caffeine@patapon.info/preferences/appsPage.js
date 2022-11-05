/*
   This file is part of Caffeine (gnome-shell-extension-caffeine).

   Caffeine is free software: you can redistribute it and/or modify it under the terms of
   the GNU General Public License as published by the Free Software Foundation, either
   version 3 of the License, or (at your option) any later version.

   Caffeine is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
   without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
   See the GNU General Public License for more details.

   You should have received a copy of the GNU General Public License along with Caffeine.
   If not, see <https://www.gnu.org/licenses/>.

   Copyright 2022 Pakaoraki
   
   // From https://gitlab.com/skrewball/openweather/-/blob/master/src/prefs.js
*/
'use strict';

const { Adw, Gtk, GObject, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var AppsPage = GObject.registerClass(
class Caffeine_AppsPage extends Adw.PreferencesPage {
    _init(settings, settingsKey) {
        super._init({
            title: _('Apps'),
            icon_name: 'applications-symbolic',
            name: 'AppsPage'
        });
        this._settingsKey= settingsKey;
        this._settings = settings;
        
        // Apps group
        // --------------
        let addAppsButton = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'list-add-symbolic',
                label: _("Add")
            })
        });
        this.appsGroup = new Adw.PreferencesGroup({
            title: _('Apps that trigger Caffeine'),
            header_suffix: addAppsButton
        });
        
        this._refreshApps();
        
        // Add elements
        this.add(this.appsGroup);
        
        // Bind signals
        addAppsButton.connect('clicked', this._onAddApp.bind(this));
        
    }
    
    _refreshApps() {
        let _apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);

        // Check if the apps list UI needs updating
        if (this._appsListUi != _apps) {
        
        // Remove the old list
                if (this._count) {
                    for (var i = 0; i < this._count; i++) {
                        this.appsGroup.remove(this.apps[i].Row);
                    }
                    this._count = null;
                }
                
            if (_apps.length > 0) {              
                this.apps = {};
                
                // Build new apps UI list
                for (let i in _apps) {
                    this.apps[i] = {};
                    this.apps[i].ButtonBox = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        halign: Gtk.Align.CENTER,
                        spacing: 5,
                        hexpand: false,
                        vexpand: false
                    });
                    this.apps[i].DeleteButton = new Gtk.Button({
                        icon_name: 'edit-delete-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['error'],
                        hexpand: false,
                        vexpand: false
                    });
                    
                    // App info
                    let appInfo = Gio.DesktopAppInfo.new(_apps[i]);
                    const appIcon = new Gtk.Image({
                        gicon: appInfo.get_icon(),
                        pixel_size: 32,
                    });
                    appIcon.get_style_context().add_class('icon-dropshadow');
                    this.apps[i].Row = new Adw.ActionRow({
                        title: appInfo.get_display_name(),
                        subtitle: _apps[i].replace('.desktop',''),
                        activatable: true
                    });
                    
                    // Add elements
                    this.apps[i].Row.add_prefix(appIcon);
                    this.apps[i].ButtonBox.append(this.apps[i].DeleteButton);
                    this.apps[i].Row.add_suffix(this.apps[i].ButtonBox);
                    this.appsGroup.add(this.apps[i].Row);
                }
                // Bind signals
                for (let i in this.apps) {                    
                    this.apps[i].DeleteButton.connect('clicked', () => {
                        log('delete app: ' + _apps[i] )
                        this._onRemoveApp(_apps[i]);
                    });
                    
                }
                this._count = _apps.length;
            }
            this._appsListUi = _apps;
        }
        return 0;
    }
    
    _onAddApp() {
        const dialog = new NewAppDialog(this.get_root(), this._settingsKey);
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
            const apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);
            if (appInfo && !apps.some(a => a === appInfo.get_id())) {
                this._settings.set_strv(this._settingsKey.INHIBIT_APPS, [
                    ...apps, appInfo.get_id(),
                ]);
                this._refreshApps();
            }
            dialog.destroy();
        });
        dialog.show();        
    }
    
    _onRemoveApp(appId) {
        this._settings.set_strv(this._settingsKey.INHIBIT_APPS,
        this._settings.get_strv(this._settingsKey.INHIBIT_APPS).filter(id => {
            return id !== appId;
        }));
        this._refreshApps();
    }

});

const NewAppDialog = GObject.registerClass(
    class NewAppDialog extends Gtk.AppChooserDialog {
        _init(parent, settingsKey) {
            super._init({
                transient_for: parent,
                modal: true,
            });

            this._settings = ExtensionUtils.getSettings();
            this._settingsKey = settingsKey;

            this.get_widget().set({
                show_all: true,
                show_other: true, // hide more button
            });

            this.get_widget().connect('application-selected',
                this._updateSensitivity.bind(this));
            this._updateSensitivity();
        }

        _updateSensitivity() {
            const apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);
            const appInfo = this.get_widget().get_app_info();
            this.set_response_sensitive(Gtk.ResponseType.OK,
                appInfo && !apps.some(i => i.startsWith(appInfo.get_id())));
        }
    });

