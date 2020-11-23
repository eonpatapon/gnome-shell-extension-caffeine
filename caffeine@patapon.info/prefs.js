// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Adapted from auto-move-windows@gnome-shell-extensions.gcampax.github.com

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
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
const NIGHT_LIGHT_KEY = 'control-nightlight';
const NIGHT_LIGHT_APP_ONLY_KEY = 'control-nightlight-for-app';

const Columns = {
    APPINFO: 0,
    DISPLAY_NAME: 1,
    ICON: 2
};

let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

class CaffeineWidget {
    constructor(params) {
        this.w = new Gtk.Grid(params);
        this.w.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings();
        this._settings.connect('changed', this._refresh.bind(this));
        this._changedPermitted = false;


        let showCaffeineBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        let showCaffeineLabel = new Gtk.Label({label: _("Show Caffeine in top panel"),
                                           xalign: 0});

        let showCaffeineSwitch = new Gtk.Switch({active: this._settings.get_boolean(SHOW_INDICATOR_KEY)});
        showCaffeineSwitch.connect('notify::active', button => {
            this._settings.set_boolean(SHOW_INDICATOR_KEY, button.active);
        });

        showCaffeineBox.pack_start(showCaffeineLabel, true, true, 0);
        showCaffeineBox.add(showCaffeineSwitch);

        this.w.add(showCaffeineBox);

        if (ShellVersion > 6) {
            const gtkhbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                    margin: 7});

            const enableFullscreenLabel = new Gtk.Label({label: _("Enable when a fullscreen application is running"),
                                       xalign: 0});

            const enableFullscreenSwitch = new Gtk.Switch({active: this._settings.get_boolean(FULLSCREEN_KEY)});
            enableFullscreenSwitch.connect('notify::active', button => {
                this._settings.set_boolean(FULLSCREEN_KEY, button.active);
            });

            gtkhbox.pack_start(enableFullscreenLabel, true, true, 0);
            gtkhbox.add(enableFullscreenSwitch);

            this.w.add(gtkhbox);
        }

        const stateBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        const stateLabel = new Gtk.Label({label: _("Restore state across reboots"),
                                   xalign: 0});

        const stateSwitch = new Gtk.Switch({active: this._settings.get_boolean(RESTORE_KEY)});
        stateSwitch.connect('notify::active', button => {
            this._settings.set_boolean(RESTORE_KEY, button.active);
        });

        stateBox.pack_start(stateLabel, true, true, 0);
        stateBox.add(stateSwitch);

        this.w.add(stateBox);

        const notificationsBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        const notificationsLabel = new Gtk.Label({label: _("Enable notifications"),
                                   xalign: 0});

        const notificationsSwitch = new Gtk.Switch({active: this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY)});
        notificationsSwitch.connect('notify::active', button => {
            this._settings.set_boolean(SHOW_NOTIFICATIONS_KEY, button.active);
        });

        notificationsBox.pack_start(notificationsLabel, true, true, 0);
        notificationsBox.add(notificationsSwitch);

        this.w.add(notificationsBox);

        const nightlightBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        const nightlightLabel = new Gtk.Label({label: _("Pause/resume Night Light if enabled"),
                                   xalign: 0});

        const nightlightSwitch = new Gtk.Switch({active: this._settings.get_boolean(NIGHT_LIGHT_KEY)});
        nightlightSwitch.connect('notify::active', button => {
            this._settings.set_boolean(NIGHT_LIGHT_KEY, button.active);
        });

        nightlightBox.pack_start(nightlightLabel, true, true, 0);
        nightlightBox.add(nightlightSwitch);

        this.w.add(nightlightBox);

        const nightlightAppBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                margin: 7});

        const nightlightAppLabel = new Gtk.Label({label: _("Pause/resume Night Light for defined applications only"),
                                   xalign: 0});

        const nightlightAppSwitch = new Gtk.Switch({active: this._settings.get_boolean(NIGHT_LIGHT_APP_ONLY_KEY)});
        nightlightAppSwitch.connect('notify::active', button => {
            this._settings.set_boolean(NIGHT_LIGHT_APP_ONLY_KEY, button.active);
        });
        nightlightSwitch.connect('notify::active', button => {
          if (button.active) {
            nightlightAppSwitch.set_sensitive(true);
          } else {
              nightlightAppSwitch.set_active(false);
              nightlightAppSwitch.set_sensitive(false);
          }
        });

        nightlightAppBox.pack_start(nightlightAppLabel, true, true, 0);
        nightlightAppBox.add(nightlightAppSwitch);

        this.w.add(nightlightAppBox);

        this._store = new Gtk.ListStore();
        this._store.set_column_types([Gio.AppInfo, GObject.TYPE_STRING, Gio.Icon]);

        this._treeView = new Gtk.TreeView({ model: this._store,
                                            hexpand: true, vexpand: true });
        this._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        const appColumn = new Gtk.TreeViewColumn({ expand: true, sort_column_id: Columns.DISPLAY_NAME,
                                                 title: _("Applications which enable Caffeine automatically") });
        const iconRenderer = new Gtk.CellRendererPixbuf;
        appColumn.pack_start(iconRenderer, false);
        appColumn.add_attribute(iconRenderer, "gicon", Columns.ICON);
        const nameRenderer = new Gtk.CellRendererText;
        appColumn.pack_start(nameRenderer, true);
        appColumn.add_attribute(nameRenderer, "text", Columns.DISPLAY_NAME);
        this._treeView.append_column(appColumn);

        this.w.add(this._treeView);

        const toolbar = new Gtk.Toolbar();
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);
        this.w.add(toolbar);

        const newButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_NEW,
                                             label: _("Add application"),
                                             is_important: true });
        newButton.connect('clicked', this._createNew.bind(this));
        toolbar.add(newButton);

        const delButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_DELETE });
        delButton.connect('clicked', this._deleteSelected.bind(this));
        toolbar.add(delButton);

        this._changedPermitted = true;
        this._refresh();
    }

    _createNew() {
        const dialog = new Gtk.Dialog({ title: _("Create new matching rule"),
                                      transient_for: this.w.get_toplevel(),
                                      modal: true });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(_("Add"), Gtk.ResponseType.OK);
        dialog.set_default_response(Gtk.ResponseType.OK);

        const grid = new Gtk.Grid({ column_spacing: 10,
                                  row_spacing: 15,
                                  margin: 10 });
        dialog._appChooser = new Gtk.AppChooserWidget({ show_all: true });
        grid.attach(dialog._appChooser, 0, 0, 2, 1);
        dialog.get_content_area().add(grid);

        dialog.connect('response', (dialog, id) => {
            if (id != Gtk.ResponseType.OK) {
                dialog.destroy();
                return;
            }

            const appInfo = dialog._appChooser.get_app_info();
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
        });
        dialog.show_all();
    }

    _deleteSelected() {
        const [any, , iter] = this._treeView.get_selection().get_selected();

        if (any) {
            const appInfo = this._store.get_value(iter, Columns.APPINFO);

            this._changedPermitted = false;
            this._removeItem(appInfo.get_id());
            this._store.remove(iter);
            this._changedPermitted = true;
        }
    }

    _refresh() {
        if (!this._changedPermitted)
            // Ignore this notification, model is being modified outside
            return;

        this._store.clear();

        const currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);
        const validItems = [ ];
        for (let i = 0; i < currentItems.length; i++) {
            const id = currentItems[i];
            const appInfo = Gio.DesktopAppInfo.new(id);
            if (!appInfo)
                continue;
            validItems.push(currentItems[i]);

            const iter = this._store.append();
            this._store.set(iter,
                            [Columns.APPINFO, Columns.ICON, Columns.DISPLAY_NAME],
                            [appInfo, appInfo.get_icon(), appInfo.get_display_name()]);
        }

        if (validItems.length != currentItems.length) // some items were filtered out
            this._settings.set_strv(INHIBIT_APPS_KEY, validItems);
    }

    _appendItem(id) {
        const currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);

        if (currentItems.includes(id)) {
            printerr("Already have an item for this id");
            return false;
        }

        currentItems.push(id);
        this._settings.set_strv(INHIBIT_APPS_KEY, currentItems);
        return true;
    }

    _removeItem(id) {
        const currentItems = this._settings.get_strv(INHIBIT_APPS_KEY);
        const index = currentItems.indexOf(id);

        if (index < 0)
            return;

        currentItems.splice(index, 1);
        this._settings.set_strv(INHIBIT_APPS_KEY, currentItems);
    }
}

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    const widget = new CaffeineWidget();
    widget.w.show_all();

    return widget.w;
}
