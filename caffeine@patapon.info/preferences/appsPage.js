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
            const appInfo = Gio.DesktopAppInfo.new(id);

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
                    let appInfo = Gio.DesktopAppInfo.new(this._listApps[i]);
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
        const dialog = new CustomAppChooser(this.get_root());
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === CustomAppChooser.ResponseType.OK
                ? dlg.appInfo : null;
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

const CustomAppChooser = GObject.registerClass({
    Signals: {
        'response': {
            param_types: [GObject.TYPE_INT]
        }
    }
}, class CustomAppChooser extends Adw.Window {
    _init(parent) {
        super._init({
            transient_for: parent,
            modal: true
        });
        this.set_size_request(500, 250);

        this._appInfo = null;
        this._desktopAppInfoCache = new Map();

        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            homogeneous: false
        });

        this._setupHeaderBar();
        this._setupSearchRevealer();
        this._setupAppList();

        this._connectSignalsAppList();
        this._connectSignalsHeaderBar();

        container.append(this._headerBar);
        container.append(this._revealer);
        container.append(this._scrollView);
        this.set_content(container);
    }

    get appInfo() {
        return this._appInfo;
    }

    _setupHeaderBar() {
        const headerBar = new Gtk.HeaderBar({
            margin_bottom: 0
        });
        const cancelButton = Gtk.Button.new_with_label('Cancel');
        const selectButton = Gtk.Button.new_with_label('Select');
        const searchToggle = new Gtk.ToggleButton();
        const toggleIcon = Gtk.Image.new_from_icon_name('edit-find-symbolic');
        const titleWidget = new Gtk.Label({
            label: 'Select Application'
        });

        cancelButton.add_css_class('raised');
        selectButton.add_css_class('suggested-action');
        searchToggle.add_css_class('flat');
        headerBar.add_css_class('flat');
        searchToggle.set_child(toggleIcon);
        headerBar.set_show_title_buttons(false);
        headerBar.pack_start(cancelButton);
        headerBar.pack_end(selectButton);
        headerBar.pack_end(searchToggle);
        headerBar.set_title_widget(titleWidget);

        this._headerBar = headerBar;
        this._cancelButton = cancelButton;
        this._selectButton = selectButton;
        this._searchToggle = searchToggle;
    }

    _setupSearchRevealer() {
        this._revealer = new Gtk.Revealer();
        this._entry = new Gtk.SearchEntry({
            margin_start: 6,
            margin_end: 6,
            margin_bottom: 6
        });
        this._entry.add_css_class('search');
        this._revealer.set_child(this._entry);
    }

    _setupAppList() {
        const appInfosStore = this._getAppInfosStore();
        this._appFilter = Gtk.CustomFilter.new((appInfo) => {
            const dAppInfo = this._getDesktopInfoFromCache(appInfo.get_id());
            const query = this._entry.text.toLowerCase();

            const directMatch = appInfo.get_display_name().toLowerCase().includes(query);
            const idMatch = appInfo.get_id().toLowerCase().includes(query);
            // check each word in list of keywords
            const keywordMatch = dAppInfo?.get_keywords()?.some((keyword) =>
                keyword.toLowerCase().includes(query));
            const genericNameMatch = dAppInfo?.get_generic_name()?.toLowerCase().includes(query);
            const categoryMatch = dAppInfo?.get_categories()?.split(';').some((category) =>
                category.toLowerCase().includes(query));

            // arranged according to priority
            const priorities = [directMatch, idMatch, keywordMatch, genericNameMatch, categoryMatch];
            return priorities.some((match) => match); // if higher priority doesnt match, moves to lower priority
        });
        const filterModel = new Gtk.FilterListModel({
            model: appInfosStore,
            filter: this._appFilter
        });

        this._appSorter = Gtk.CustomSorter.new((appInfo1, appInfo2) => {
            const query = this._entry.text.toLowerCase();
            let appInfo1Index = appInfo1.get_display_name().toLowerCase().indexOf(query);
            let appInfo2Index = appInfo2.get_display_name().toLowerCase().indexOf(query);

            // handle -1 (not matched index)
            appInfo1Index = appInfo1Index < 0 ? 9999 : appInfo1Index;
            appInfo2Index = appInfo2Index < 0 ? 9999 : appInfo2Index;

            if (appInfo1Index < appInfo2Index) {
                return Gtk.Ordering.SMALLER;
            } else if (appInfo1Index > appInfo2Index) {
                return Gtk.Ordering.LARGER;
            } else {
                return Gtk.Ordering.EQUAL;
            }
        });

        const sorterModel = new Gtk.SortListModel({
            model: filterModel,
            sorter: this._appSorter
        });


        this._singleSelection = Gtk.SingleSelection.new(sorterModel);
        this._factory = new Gtk.SignalListItemFactory();
        const listView = new Gtk.ListView({
            model: this._singleSelection,
            factory: this._factory,
            vexpand: true
        });

        this._scrollView = new Gtk.ScrolledWindow({
            vexpand: true,
            margin_top: 0,
            margin_bottom: 0,
            margin_start: 6,
            margin_end: 6,
            min_content_height: 200,
            max_content_height: 500,
            has_frame: true
        });
        this._scrollView.set_child(listView);
    }

    _connectSignalsHeaderBar() {
        this._searchToggle.connect('toggled', (obj) => {
            if (obj.active) {
                this._revealer.reveal_child = true;
                this._entry.grab_focus();
            } else {
                this._revealer.reveal_child = false;
            }
        });

        this._cancelButton.connect('clicked', () => {
            this._appInfo = null;
            this.emit('response', CustomAppChooser.ResponseType.CANCEL);
            this.destroy();
        });
        this._selectButton.connect('clicked', () => {
            const selectedItem = this._singleSelection.get_selected_item();
            if (selectedItem) {
                this._appInfo = selectedItem;
                this.emit('response', CustomAppChooser.ResponseType.OK);
            } else {
                this._appInfo = null;
                this.emit('response', CustomAppChooser.ResponseType.BAD);
            }
            this.destroy();
        });

        this._entry.connect('search-changed', (obj) => {
            console.log(obj.get_text());
            this._appFilter.changed(Gtk.FilterChange.DIFFERENT);
            this._appSorter.changed(Gtk.SorterChange.DIFFERENT);
            this._singleSelection.set_selected(0);
        });
    }

    _connectSignalsAppList() {
        this._factory.connect('setup', (_factory, listItem) => {
            const box = new Gtk.Box({ spacing: 6 });
            const image = new Gtk.Image({ pixel_size: 24 });
            const label = new Gtk.Label({ xalign: 0, hexpand: true });
            box.append(image);
            box.append(label);
            listItem.set_child(box);
        });
        this._factory.connect('bind', (_factory, listItem) => {
            const appInfo = listItem.get_item();
            const icon = appInfo.get_icon();
            const box = listItem.get_child();

            const image = box.get_first_child();
            const label = box.get_last_child();

            if (icon instanceof Gio.ThemedIcon) {
                image.set_from_gicon(icon);
            } else if (icon instanceof Gio.FileIcon) {
                const file = icon.get_file?.();
                if (file) {
                    const path = file.get_path();
                    console.log(path);
                    if (path) {
                        image.set_from_file(path);
                    }
                }
            }
            label.set_label(appInfo.get_display_name());
        });

        this._singleSelection.connect('notify::selected', () => {
            console.log('notifiy selected: singleSelection');
        });
    }

    _getDesktopInfoFromCache(id) {
        if (!this._desktopAppInfoCache.has(id)) {
            const info = Gio.DesktopAppInfo.new(id);
            this._desktopAppInfoCache.set(id, info);
        }

        return this._desktopAppInfoCache.get(id);
    }

    _getAppInfosStore() {
        const appInfos = Gio.AppInfo.get_all().filter((_appInfo) => _appInfo.should_show());
        const store = new Gio.ListStore({ item_type: Gio.AppInfo });
        appInfos.forEach((app) => {
            store.append(app);
            console.log(app.get_name());
        });

        return store;
    }

    destroy() {
        this._desktopAppInfoCache.clear();
        super.destroy();
    }
});

CustomAppChooser.ResponseType = Object.freeze({
    OK: 0,
    CANCEL: 1,
    BAD: 2
});
