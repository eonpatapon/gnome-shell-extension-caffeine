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

const CustomHeaderBar =  GObject.registerClass({
    Signals: {
        'action-triggered': {
            param_types: [GObject.TYPE_INT]
        }
    }
}, class CustomHeaderBar extends Gtk.HeaderBar {
    static ActionType = {
        CANCEL: 0,
        SELECT: 1,
        SEARCH_COMMAND: 2
    };

    constructor() {
        super();
        this.set_show_title_buttons(false);

        const cancelButton = Gtk.Button.new_with_label(_('Cancel'));
        const selectButton = Gtk.Button.new_with_label(_('Select'));
        this._searchToggle = new Gtk.ToggleButton({
            css_classes: ['flat'],
            child: Gtk.Image.new_from_icon_name('edit-find-symbolic')
        });
        cancelButton.add_css_class('raised');
        selectButton.add_css_class('suggested-action');

        cancelButton.connect('clicked',
            this._onActionTriggered.bind(this, CustomHeaderBar.ActionType.CANCEL));
        selectButton.connect('clicked',
            this._onActionTriggered.bind(this, CustomHeaderBar.ActionType.SELECT));
        this._searchToggle.connect('toggled',
            this._onActionTriggered.bind(this, CustomHeaderBar.ActionType.SEARCH_COMMAND));

        this.pack_start(cancelButton);
        this.pack_end(selectButton);
        this.pack_end(this._searchToggle);
        this.set_title_widget(new Gtk.Label({
            label: _('Select Application')
        }));
    }

    _onActionTriggered(actionType) {
        this.emit('action-triggered', actionType);
    }

    get search_command() {
        return this._searchToggle.active;
    }
});

const CustomAppList = GObject.registerClass(
class CustomAppList extends Gtk.ScrolledWindow {
    constructor() {
        super({
            vexpand: true,
            has_frame: true
        });

        this._query = null;
        this._desktopAppInfoCache = new Map();

        const baseModel = this._generateBaseModel();
        const filterModel = new Gtk.FilterListModel({
            model: baseModel,
            filter: Gtk.CustomFilter.new(this._filterCallBack.bind(this))
        });
        const sortModel = new Gtk.SortListModel({
            model: filterModel,
            sorter: Gtk.CustomSorter.new(this._sorterCallBack.bind(this))
        });

        this._singleSelection = Gtk.SingleSelection.new(sortModel);
        this._factory = new Gtk.SignalListItemFactory();
        this._initFactory();
        const listView = new Gtk.ListView({
            factory: this._factory,
            model: this._singleSelection
        });

        this.set_child(listView);
    }

    set query(q) {
        this._query = q;
    }

    updateModel() {
        this._singleSelection.get_model().get_model().get_filter().changed(Gtk.FilterChange.DIFFERENT);
        this._singleSelection.get_model().get_sorter().changed(Gtk.SorterChange.DIFFERENT);
    }

    _filterCallBack(appInfo) {
        const dAppInfo = this._getDesktopInfoFromCache(appInfo.get_id());
        const query = (this._query || '').toLowerCase();

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
        return priorities.some((match) => match);
    }

    _sorterCallBack(appInfo1, appInfo2) {
        const query = (this._query || '').toLowerCase();
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
    }

    _initFactory() {
        // blueprint
        this._factory.connect('setup', (f, listItem) => {
            const box = new Gtk.Box({ spacing: 6 });
            const img = new Gtk.Image({ pixel_size: 24 });
            const label = new Gtk.Label({ xalign: 0, hexpand: true });
            box.append(img);
            box.append(label);
            listItem.set_child(box);
        });

        // implementation
        this._factory.connect('bind', (f, listItem) => {
            const appInfo = listItem.get_item();  // an item from baseModel
            const icon = appInfo.get_icon(); // could be themed or a file icon

            const box = listItem.get_child();
            const image = box.get_first_child();
            const label = box.get_last_child();

            if (icon instanceof Gio.ThemedIcon) {
                image.set_from_gicon(icon);
            } else if (icon instanceof Gio.FileIcon) {
                const file = icon.get_file?.();
                const path = file?.get_path();
                if (path) {
                    image.set_from_file(path);
                }
            }
            label.set_label(appInfo.get_display_name());
        });
    }

    _generateBaseModel() {
        const appInfos = Gio.AppInfo.get_all().filter((info) => info.should_show());
        const model = new Gio.ListStore({ item_type: Gio.AppInfo });
        appInfos.forEach((info) => model.append(info));

        return model;
    }

    _getDesktopInfoFromCache(id) {
        if (!this._desktopAppInfoCache.has(id)) {
            const info = Gio.DesktopAppInfo.new(id);
            this._desktopAppInfoCache.set(id, info);
        }

        return this._desktopAppInfoCache.get(id);
    }
});

export const AppChooser = GObject.registerClass({
    Signals: {
        'response': {
            param_types: [GObject.TYPE_INT]
        }
    }
}, class AppChooser extends Adw.Window {
    static ResponseType = {
        OK: 0,
        CANCEL: 1,
        BAD: 2
    };

    constructor(parent) {
        super({
            transient_for: parent,
            modal: true  // avoid interactive with parent window if Self is not destroyed
        });
        this.set_size_request(450, 250);
        this._appInfo = null;

        const toolbarViewContent = new Gtk.Box({
            spacing: 0,
            orientation: Gtk.Orientation.VERTICAL,
            margin_start: 6,
            margin_end: 6
        });
        const revealer = new Gtk.Revealer();
        const searchEntry = new Gtk.SearchEntry();
        revealer.set_child(searchEntry);
        toolbarViewContent.append(revealer);

        const toolbarView = new Adw.ToolbarView({
            top_bar_style: Adw.ToolbarStyle.FLAT,
            bottom_bar_style: Adw.ToolbarStyle.FLAT
        });

        const appList = new CustomAppList();
        toolbarViewContent.append(appList);

        searchEntry.connect('search-changed', (s) => {
            appList.query = s.text;
            appList.updateModel();
        });



        const header = new CustomHeaderBar();
        header.connect('action-triggered', (h, actionType) => {
            if (actionType === CustomHeaderBar.ActionType.SEARCH_COMMAND) {
                revealer.reveal_child = h.search_command;
                searchEntry.grab_focus();
            } else if (actionType === CustomHeaderBar.ActionType.SELECT) {
                const selectedItem = appList.get_child().get_model().get_selected_item();
                if (selectedItem) {
                    this._appInfo = selectedItem;
                    this.emit('response', AppChooser.ResponseType.OK);
                } else {
                    this._appInfo = null;
                    this.emit('response', AppChooser.ResponseType.BAD);
                }
                this.destroy();
            } else if (actionType === CustomHeaderBar.ActionType.CANCEL) {
                this._appInfo = null;
                this.emit('response', AppChooser.ResponseType.CANCEL);
                this.destroy();
            }
        }
        );

        toolbarView.add_top_bar(header);
        toolbarView.set_content(toolbarViewContent);
        this.set_content(toolbarView);
    }

    get appInfo() {
        return this._appInfo;
    }
});


