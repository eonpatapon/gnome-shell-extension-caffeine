// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init buildPrefsWidget */

// loosely based on https://gitlab.gnome.org/GNOME/gnome-shell-extensions/-/blob/master/extensions/auto-move-windows/prefs.js

const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;

const SettingsKey = {
    INHIBIT_APPS: 'inhibit-apps',
    SHOW_INDICATOR: 'show-indicator',
    SHOW_NOTIFICATIONS: 'show-notifications',
    FULLSCREEN: 'enable-fullscreen',
    RESTORE: 'restore-state',
    NIGHT_LIGHT: 'nightlight-control',
};

const SettingListBoxRow = GObject.registerClass({
    Properties: {
        'label': GObject.ParamSpec.string(
            'label', 'Settings Label', 'label',
            GObject.ParamFlags.READWRITE,
            ''),
        'description': GObject.ParamSpec.string(
            'description', 'Settings Description', 'description',
            GObject.ParamFlags.READWRITE,
            ''),
        'settingsKey': GObject.ParamSpec.string(
            'settingsKey', 'Settings Key', 'settingsKey',
            GObject.ParamFlags.READWRITE,
            ''),
        'type': GObject.ParamSpec.string(
            'type', 'Control Type', 'type',
            GObject.ParamFlags.READWRITE,
            'switch'),
        'options': GObject.param_spec_variant(
            'options', 'Options for Control', 'options',
            new GLib.VariantType('a{sv}'),
            null,
            GObject.ParamFlags.READWRITE),
    },
},
class SettingListBoxRow extends Gtk.ListBoxRow {
    _init(label, description, settingsKey, type, options) {
        this.rowType = type;
        this._settings = ExtensionUtils.getSettings();

        const _hbox = new Gtk.Box({
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        super._init({
            child: _hbox,
        });

        let _vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });
        _hbox.append(_vbox);

        let _label = new Gtk.Label({
            label,
            halign: Gtk.Align.START,
            hexpand: true,
        });
        _vbox.append(_label);

        const _descriptionAttributes = new Pango.AttrList();
        _descriptionAttributes.insert(Pango.attr_scale_new(0.83));
        let _description = new Gtk.Label({
            label: description,
            halign: Gtk.Align.START,
            attributes: _descriptionAttributes,
        });
        _description.get_style_context().add_class('dim-label');
        _vbox.append(_description);

        switch (type) {
        case 'combobox':
            this.control = new Gtk.ComboBoxText();
            for (let item of options.values)
                this.control.append_text(item);
            this._settings.connect(`changed::${settingsKey}`, () => {
                this.control.set_active(this._settings.get_enum(settingsKey));
            });
            this.control.connect('changed', combobox => {
                this._settings.set_enum(settingsKey, combobox.get_active());
            });
            this.control.set_active(this._settings.get_enum(settingsKey) || 0);
            break;
        default:
            this.rowType = 'switch';
            this.control = new Gtk.Switch({
                active: this._settings.get_boolean(settingsKey),
                halign: Gtk.Align.END,
                valign: Gtk.Align.CENTER,
            });
            this._settings.bind(settingsKey, this.control, 'active', Gio.SettingsBindFlags.DEFAULT);
        }
        _hbox.append(this.control);
    }
}
);

const SettingsPane = GObject.registerClass(
    class SettingsPane extends Gtk.Frame {
        _init() {
            super._init({
                margin_top: 36,
                margin_bottom: 36,
                margin_start: 36,
                margin_end: 36,
            });

            const _listBox = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
                valign: Gtk.Align.START,
                show_separators: true,
            });
            this.set_child(_listBox);

            _listBox.connect('row-activated', (widget, row) => {
                this._rowActivated(widget, row);
            });

            const _showIndicator = new SettingListBoxRow(_('Show status indicator in top panel'), _('Enable or disable the Caffeine icon in the top panel'), SettingsKey.SHOW_INDICATOR);
            _listBox.append(_showIndicator);

            const _showNotifications = new SettingListBoxRow(_('Notifications'), _('Enable notifications when Caffeine is enabled or disabled'), SettingsKey.SHOW_NOTIFICATIONS);
            _listBox.append(_showNotifications);

            const _rememberState = new SettingListBoxRow(_('Remember state'), _('Remember the last state across sessions and reboots'), SettingsKey.RESTORE);
            _listBox.append(_rememberState);

            const _fullscreenApps = new SettingListBoxRow(_('Enable for fullscreen apps'), _('Automatically enable when an app enters fullscreen mode'), SettingsKey.FULLSCREEN);
            _listBox.append(_fullscreenApps);

            const _controlNightlight = new SettingListBoxRow(_('Pause and resume Night Light'), _('Toggles the night light together with Caffeine\'s state'), SettingsKey.NIGHT_LIGHT, 'combobox', {
                values: [
                    _('Never'), _('Always'), _('For apps on list'),
                ],
            });
            _listBox.append(_controlNightlight);
        }

        _rowActivated(widget, row) {
            if (row.rowType === 'switch' || row.rowType === undefined)
                row.control.set_active(!row.control.get_active());
            else if (row.rowType === 'combobox')
                row.control.popup();
        }
    }
);

const AppsPane = GObject.registerClass(
    class AppsPane extends Gtk.ScrolledWindow {
        _init() {
            super._init({
                hscrollbar_policy: Gtk.PolicyType.NEVER,
            });

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                halign: Gtk.Align.CENTER,
                spacing: 12,
                margin_top: 36,
                margin_bottom: 36,
                margin_start: 36,
                margin_end: 36,
            });
            this.set_child(box);

            box.append(new Gtk.Label({
                label: '<b>%s</b>'.format(_('Apps that trigger Caffeine')),
                use_markup: true,
                halign: Gtk.Align.START,
            }));

            this._list = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
                valign: Gtk.Align.START,
                show_separators: true,
            });
            box.append(this._list);

            const context = this._list.get_style_context();
            const cssProvider = new Gtk.CssProvider();
            cssProvider.load_from_data(
                'list { min-width: 30em; }');

            context.add_provider(cssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            context.add_class('frame');

            this._list.append(new NewAppRow());

            this._actionGroup = new Gio.SimpleActionGroup();
            this._list.insert_action_group('rules', this._actionGroup);

            let action;
            action = new Gio.SimpleAction({ name: 'add' });
            action.connect('activate', this._onAddActivated.bind(this));
            this._actionGroup.add_action(action);

            action = new Gio.SimpleAction({
                name: 'remove',
                parameter_type: new GLib.VariantType('s'),
            });
            action.connect('activate', this._onRemoveActivated.bind(this));
            this._actionGroup.add_action(action);

            action = new Gio.SimpleAction({ name: 'update' });
            action.connect('activate', () => {
                this._settings.set_strv(SettingsKey.INHIBIT_APPS,
                    this._getRuleRows());
            });
            this._actionGroup.add_action(action);
            this._updateAction = action;

            this._settings = ExtensionUtils.getSettings();
            this._changedId = this._settings.connect('changed',
                this._sync.bind(this));
            this._sync();

            this.connect('destroy', () => this._settings.run_dispose());
        }

        _onAddActivated() {
            const dialog = new NewAppDialog(this.get_root());
            dialog.connect('response', (dlg, id) => {
                const appInfo = id === Gtk.ResponseType.OK
                    ? dialog.get_widget().get_app_info() : null;
                const apps = this._settings.get_strv(SettingsKey.INHIBIT_APPS);
                if (appInfo && !apps.some(a => a === appInfo.get_id())) {
                    this._settings.set_strv(SettingsKey.INHIBIT_APPS, [
                        ...apps, appInfo.get_id(),
                    ]);
                }
                dialog.destroy();
            });
            dialog.show();
        }

        _onRemoveActivated(action, param) {
            const removed = param.deepUnpack();
            this._settings.set_strv(SettingsKey.INHIBIT_APPS,
                this._settings.get_strv(SettingsKey.INHIBIT_APPS).filter(id => {
                    return id !== removed;
                }));
        }

        _getRuleRows() {
            return [...this._list].filter(row => !!row.id);
        }

        _sync() {
            const oldRules = this._getRuleRows();
            const newRules = this._settings.get_strv(SettingsKey.INHIBIT_APPS);

            this._settings.block_signal_handler(this._changedId);
            this._updateAction.enabled = false;

            newRules.forEach((id, index) => {
                const appInfo = Gio.DesktopAppInfo.new(id);

                if (appInfo)
                    this._list.insert(new AppRow(appInfo), index);
            });

            const removed = oldRules.filter(
                id => !newRules.find(r => r.id === id));
            removed.forEach(r => this._list.remove(r));

            this._settings.unblock_signal_handler(this._changedId);
            this._updateAction.enabled = true;
        }
    });

const AppRow = GObject.registerClass({
    Properties: {
        'id': GObject.ParamSpec.string(
            'id', 'id', 'id',
            GObject.ParamFlags.READABLE,
            ''),
    },
}, class AppRow extends Gtk.ListBoxRow {
    _init(appInfo) {
        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        super._init({
            activatable: false,
            child: box,
        });
        this._appInfo = appInfo;

        const icon = new Gtk.Image({
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        icon.get_style_context().add_class('icon-dropshadow');
        box.append(icon);

        const label = new Gtk.Label({
            label: appInfo.get_display_name(),
            halign: Gtk.Align.START,
            hexpand: true,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        box.append(label);

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', this.id),
            icon_name: 'edit-delete-symbolic',
        });
        box.append(button);
    }

    get id() {
        return this._appInfo.get_id();
    }
});

const NewAppRow = GObject.registerClass(
    class NewAppRow extends Gtk.ListBoxRow {
        _init() {
            super._init({
                action_name: 'rules.add',
                child: new Gtk.Image({
                    icon_name: 'list-add-symbolic',
                    pixel_size: 16,
                    margin_top: 12,
                    margin_bottom: 12,
                    margin_start: 12,
                    margin_end: 12,
                }),
            });
            this.update_property(
                [Gtk.AccessibleProperty.LABEL], [_('Add Application')]);
        }
    });

const NewAppDialog = GObject.registerClass(
    class NewAppDialog extends Gtk.AppChooserDialog {
        _init(parent) {
            super._init({
                transient_for: parent,
                modal: true,
            });

            this._settings = ExtensionUtils.getSettings();

            this.get_widget().set({
                show_all: true,
                show_other: true, // hide more button
            });

            this.get_widget().connect('application-selected',
                this._updateSensitivity.bind(this));
            this._updateSensitivity();
        }

        _updateSensitivity() {
            const apps = this._settings.get_strv(SettingsKey.INHIBIT_APPS);
            const appInfo = this.get_widget().get_app_info();
            this.set_response_sensitive(Gtk.ResponseType.OK,
                appInfo && !apps.some(i => i.startsWith(appInfo.get_id())));
        }
    });

const CaffeineSettingsWidget = GObject.registerClass(
    class CaffeineSettingsWidget extends Gtk.Notebook {
        _init() {
            super._init();

            const _settingsPane = new SettingsPane();
            this.append_page(_settingsPane, new Gtk.Label({ label: _('General') }));

            const _appsPane = new AppsPane();
            this.append_page(_appsPane, new Gtk.Label({ label: _('Apps') }));
        }
    }
);

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    return new CaffeineSettingsWidget();
}
