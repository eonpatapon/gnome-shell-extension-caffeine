// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Adapted from auto-move-windows@gnome-shell-extensions.gcampax.github.com

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const GObject = imports.gi.GObject;
const Config = imports.misc.config;

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const FULLSCREEN_KEY = 'enable-fullscreen';
const RESTORE_KEY = 'restore-state';

const Columns = {
    APPINFO: 0,
    DISPLAY_NAME: 1,
    ICON: 2
};

let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

const CaffeineWidget = new Lang.Class({
    Name: 'CaffeineWidget',

    _init: function(params) {
        this.w = new Gtk.Grid(params);
        this.w.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings();
        this._settings.connect('changed', Lang.bind(this, this._refresh));
        this._changedPermitted = false;


        let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        let label = new Gtk.Label({label: _("Show Caffeine in top panel"),
                                           xalign: 0});

        let show = new Gtk.Switch({active: this._settings.get_boolean(SHOW_INDICATOR_KEY)});
        show.connect('notify::active', Lang.bind(this, function(button) {
            this._settings.set_boolean(SHOW_INDICATOR_KEY, button.active);
        }));

        hbox.pack_start(label, true, true, 0);
        hbox.add(show);

        this.w.add(hbox);

        if (ShellVersion > 6) {
            let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                    margin: 7});

            let label = new Gtk.Label({label: _("Enable when a fullscreen application is running"),
                                       xalign: 0});

            let show = new Gtk.Switch({active: this._settings.get_boolean(FULLSCREEN_KEY)});
            show.connect('notify::active', Lang.bind(this, function(button) {
                this._settings.set_boolean(FULLSCREEN_KEY, button.active);
            }));

            hbox.pack_start(label, true, true, 0);
            hbox.add(show);

            this.w.add(hbox);
        }

        let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        let label = new Gtk.Label({label: _("Restore state across reboots"),
                                   xalign: 0});

        let show = new Gtk.Switch({active: this._settings.get_boolean(RESTORE_KEY)});
        show.connect('notify::active', Lang.bind(this, function(button) {
            this._settings.set_boolean(RESTORE_KEY, button.active);
        }));

        hbox.pack_start(label, true, true, 0);
        hbox.add(show);

        this.w.add(hbox);

        let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        let label = new Gtk.Label({label: _("Enable notifications"),
                                   xalign: 0});

        let show = new Gtk.Switch({active: this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY)});
        show.connect('notify::active', Lang.bind(this, function(button) {
            this._settings.set_boolean(SHOW_NOTIFICATIONS_KEY, button.active);
        }));

        hbox.pack_start(label, true, true, 0);
        hbox.add(show);

        this.w.add(hbox);

        this._store = new Gtk.ListStore();
        this._store.set_column_types([Gio.AppInfo, GObject.TYPE_STRING, Gio.Icon]);

        this._treeView = new Gtk.TreeView({ model: this._store,
                                            hexpand: true, vexpand: true });
        this._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let appColumn = new Gtk.TreeViewColumn({ expand: true, sort_column_id: Columns.DISPLAY_NAME,
                                                 title: _("Applications which enable Caffeine automatically") });
        let iconRenderer = new Gtk.CellRendererPixbuf;
        appColumn.pack_start(iconRenderer, false);
        appColumn.add_attribute(iconRenderer, "gicon", Columns.ICON);
        let nameRenderer = new Gtk.CellRendererText;
        appColumn.pack_start(nameRenderer, true);
        appColumn.add_attribute(nameRenderer, "text", Columns.DISPLAY_NAME);
        this._treeView.append_column(appColumn);

        this.w.add(this._treeView);

        let toolbar = new Gtk.Toolbar();
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);
        this.w.add(toolbar);

        let newButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_NEW,
                                             label: _("Add application"),
                                             is_important: true });
        newButton.connect('clicked', Lang.bind(this, this._createNew));
        toolbar.add(newButton);

        let delButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_DELETE });
        delButton.connect('clicked', Lang.bind(this, this._deleteSelected));
        toolbar.add(delButton);

        this._changedPermitted = true;
        this._refresh();
    },

    _createNew: function() {
        let dialog = new Gtk.Dialog({ title: _("Create new matching rule"),
                                      transient_for: this.w.get_toplevel(),
                                      modal: true });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(_("Add"), Gtk.ResponseType.OK);
        dialog.set_default_response(Gtk.ResponseType.OK);

        let grid = new Gtk.Grid({ column_spacing: 10,
                                  row_spacing: 15,
                                  margin: 10 });
        dialog._appChooser = new Gtk.AppChooserWidget({ show_all: true });
        grid.attach(dialog._appChooser, 0, 0, 2, 1);
        dialog.get_content_area().add(grid);

        dialog.connect('response', Lang.bind(this, function(dialog, id) {
            if (id != Gtk.ResponseType.OK) {
                dialog.destroy();
                return;
            }

            let appInfo = dialog._appChooser.get_app_info();
            if (!appInfo)
                return;

            this._changedPermitted = false;
            if (!this._appendItem(appInfo.get_id())) {
                this._changedPermitted = true;
                return;
            }
            let iter = this._store.append();

            this._store.set(iter,
                            [Columns.APPINFO, Columns.ICON, Columns.DISPLAY_NAME],
                            [appInfo, appInfo.get_icon(), appInfo.get_display_name()]);
            this._changedPermitted = true;

            dialog.destroy();
        }));
        dialog.show_all();
    },

    _deleteSelected: function() {
        let [any, model, iter] = this._treeView.get_selection().get_selected();

        if (any) {
            let appInfo = this._store.get_value(iter, Columns.APPINFO);

            this._changedPermitted = false;
            this._removeItem(appInfo.get_id());
            this._store.remove(iter);
            this._changedPermitted = true;
        }
    },

    _refresh: function() {
        if (!this._changedPermitted)
            // Ignore this notification, model is being modified outside
            return;

        this._store.clear();

        let currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);
        let validItems = [ ];
        for (let i = 0; i < currentItems.length; i++) {
            let id = currentItems[i];
            let appInfo = Gio.DesktopAppInfo.new(id);
            if (!appInfo)
                continue;
            validItems.push(currentItems[i]);

            let iter = this._store.append();
            this._store.set(iter,
                            [Columns.APPINFO, Columns.ICON, Columns.DISPLAY_NAME],
                            [appInfo, appInfo.get_icon(), appInfo.get_display_name()]);
        }

        if (validItems.length != currentItems.length) // some items were filtered out
            this._settings.set_strv(INHIBIT_APPS_KEY, validItems);
    },

    _appendItem: function(id) {
        let currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);
        let alreadyHave = currentItems.indexOf(id) != -1;

        if (alreadyHave) {
            printerr("Already have an item for this id");
            return false;
        }

        currentItems.push(id);
        this._settings.set_strv(INHIBIT_APPS_KEY, currentItems);
        return true;
    },

    _removeItem: function(id) {
        let currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);
        let index = currentItems.indexOf(id);

        if (index < 0)
            return;

        currentItems.splice(index, 1);
        this._settings.set_strv(INHIBIT_APPS_KEY, currentItems);
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new CaffeineWidget();
    widget.w.show_all();

    return widget.w;
}
