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
/* exported AppsPage */
'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
const ShellVersion = parseFloat(Config.PACKAGE_VERSION);

// Required for GNOME 49, without breaking on earlier shells
let GioUnix;
try {
    GioUnix = (await import('gi://GioUnix?version=2.0')).default;
} catch {}

export var AppsPage = GObject.registerClass(
class CaffeineAppsPage extends Adw.PreferencesPage {
    _init(settings, settingsKey) {
        super._init({
            title: _('Apps'),
            icon_name: 'applications-symbolic',
            name: 'AppsPage'
        });
        this._settingsKey = settingsKey;
        this._settings = settings;
        this._listApps = [];

        // Apps behavior group
        // --------------
        let appsBehaviorGroup = new Adw.PreferencesGroup({
            title: _('Trigger mode')
        });

        // Apps behavior select mode
        let appsTriggerMode = new Gtk.StringList();
        appsTriggerMode.append(_('Running'));
        appsTriggerMode.append(_('Focus'));
        appsTriggerMode.append(_('Active workspace'));
        let appsTriggerModeRow = new Adw.ComboRow({
            title: _('Apps trigger Caffeine mode'),
            subtitle: _('Choose the way apps will trigger Caffeine'),
            model: appsTriggerMode,
            selected: this._settings.get_enum(this._settingsKey.TRIGGER_APPS_MODE)
        });

        // Add elements
        appsBehaviorGroup.add(appsTriggerModeRow);
        this.add(appsBehaviorGroup);

        // Apps list group
        // --------------
        let addAppsButton = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'list-add-symbolic',
                label: _('Add')
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
        appsTriggerModeRow.connect('notify::selected', (widget) => {
            this._settings.set_enum(this._settingsKey.TRIGGER_APPS_MODE, widget.selected);
        });
    }

    _refreshApps() {
        const _apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);

        // Clear the Apps list
        this._listApps.length = 0;

        // Update the list & Check if app still exist
        _apps.forEach((id) => {
            let appInfo = null;
            if (ShellVersion >= 49) {
                appInfo = GioUnix.DesktopAppInfo.new(id);
            } else {
                appInfo = Gio.DesktopAppInfo.new(id);
            }

            if (appInfo) {
                this._listApps.push(id);
            }
        });

        // Check if the apps list UI needs updating
        if (this._appsListUi !== this._listApps) {
            // Remove the old list
            if (this._count) {
                for (let i = 0; i < this._count; i++) {
                    this.appsGroup.remove(this.apps[i].Row);
                }
                this._count = null;
            }

            if (this._listApps.length > 0) {
                this.apps = {};

                // Build new apps UI list
                for (let i in this._listApps) {
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
                    let appInfo = null;
                    if (ShellVersion >= 49) {
                        appInfo = GioUnix.DesktopAppInfo.new(this._listApps[i]);
                    } else {
                        appInfo = Gio.DesktopAppInfo.new(this._listApps[i]);
                    }
                    const appIcon = new Gtk.Image({
                        gicon: appInfo.get_icon(),
                        pixel_size: 32
                    });
                    appIcon.get_style_context().add_class('icon-dropshadow');
                    this.apps[i].Row = new Adw.ActionRow({
                        title: appInfo.get_display_name(),
                        subtitle: this._listApps[i].replace('.desktop', ''),
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
                        this._onRemoveApp(this._listApps[i]);
                    });
                }
                this._count = this._listApps.length;
            }
            this._appsListUi = [...this._listApps];
        }
        return 0;
    }

    _onAddApp() {
        const dialog = new NewAppDialog(this.get_root(), this._settings, this._settingsKey);
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
            const apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);
            if (appInfo && !apps.some((a) => a === appInfo.get_id())) {
                this._settings.set_strv(this._settingsKey.INHIBIT_APPS, [
                    ...apps, appInfo.get_id()
                ]);
                this._refreshApps();
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _onRemoveApp(appId) {
        this._settings.set_strv(this._settingsKey.INHIBIT_APPS,
            this._settings.get_strv(this._settingsKey.INHIBIT_APPS).filter((id) => {
                return id !== appId;
            })
        );
        this._refreshApps();
    }
});

const NewAppDialog = GObject.registerClass(
    class NewAppDialog extends Gtk.AppChooserDialog {
        _init(parent, settings, settingsKey) {
            super._init({
                transient_for: parent,
                modal: true
            });

            this._settings = settings;
            this._settingsKey = settingsKey;

            this.get_widget().set({
                show_all: true,
                show_other: true // hide more button
            });

            this.get_widget().connect('application-selected',
                this._updateSensitivity.bind(this));
            this._updateSensitivity();
        }

        _updateSensitivity() {
            const apps = this._settings.get_strv(this._settingsKey.INHIBIT_APPS);
            const appInfo = this.get_widget().get_app_info();
            this.set_response_sensitive(Gtk.ResponseType.OK,
                appInfo && !apps.some((i) => i.startsWith(appInfo.get_id())));
        }
    });
