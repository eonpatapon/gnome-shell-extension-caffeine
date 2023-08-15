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
/* exported DisplayPage */
'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export var DisplayPage = GObject.registerClass(
class CaffeineDisplayPage extends Adw.PreferencesPage {
    _init(settings, settingsKey) {
        super._init({
            title: _('Display'),
            icon_name: 'video-display-symbolic',
            name: 'DisplayPage'
        });
        this._settings = settings;
        this._settingsKey = settingsKey;

        // Display group
        // --------------
        let displayGroup = new Adw.PreferencesGroup({
            title: _('Display')
        });

        // Show indicator
        let showStatusIndicator = new Gtk.StringList();
        showStatusIndicator.append(_('Only when active'));
        showStatusIndicator.append(_('Always'));
        showStatusIndicator.append(_('Never'));
        let showStatusIndicatorRow = new Adw.ComboRow({
            title: _('Show status indicator in top panel'),
            subtitle: _('Enable or disable the Caffeine icon in the top panel'),
            model: showStatusIndicator,
            selected: this._settings.get_enum(this._settingsKey.SHOW_INDICATOR)
        });

        // Show timer
        let showTimerSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean(this._settingsKey.SHOW_TIMER)
        });
        let showTimerRow = new Adw.ActionRow({
            title: _('Show timer in top panel'),
            subtitle: _('Enable or disable the timer in the top panel'),
            activatable_widget: showTimerSwitch
        });
        showTimerRow.add_suffix(showTimerSwitch);

        // Notifications
        let notificationSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean(this._settingsKey.SHOW_NOTIFICATIONS)
        });
        let notificationRow = new Adw.ActionRow({
            title: _('Notifications'),
            subtitle: _('Enable notifications when Caffeine is enabled or disabled'),
            activatable_widget: notificationSwitch
        });
        notificationRow.add_suffix(notificationSwitch);

        // Indicator position offset
        this.lastIndicatorPos = this._settings.get_int(this._settingsKey.INDICATOR_POS_MAX);
        this.posIndicatorOffsetButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: -1,
                upper: this.lastIndicatorPos,
                step_increment: 1,
                page_increment: 1,
                page_size: 0,
                value: this._settings.get_int(this._settingsKey.INDICATOR_POSITION)
            }),
            climb_rate: 1,
            digits: 0,
            numeric: true,
            valign: Gtk.Align.CENTER
        });
        let posIndicatorOffsetRow = new Adw.ActionRow({
            title: _('Status indicator position'),
            subtitle: _('The position relative of indicator icon to other items'),
            activatable_widget: this.posIndicatorOffsetButton
        });
        posIndicatorOffsetRow.add_suffix(this.posIndicatorOffsetButton);

        // Add elements
        displayGroup.add(showStatusIndicatorRow);
        displayGroup.add(showTimerRow);
        displayGroup.add(notificationRow);
        displayGroup.add(posIndicatorOffsetRow);
        this.add(displayGroup);

        // Bind signals
        // --------------
        showStatusIndicatorRow.connect('notify::selected', (widget) => {
            if (widget.selected === 2) {
                showTimerSwitch.set_sensitive(false);
            } else {
                showTimerSwitch.set_sensitive(true);
            }
            this._settings.set_enum(this._settingsKey.SHOW_INDICATOR, widget.selected);
        });
        showTimerSwitch.connect('notify::active', (widget) => {
            this._settings.set_boolean(this._settingsKey.SHOW_TIMER, widget.get_active());
        });
        notificationSwitch.connect('notify::active', (widget) => {
            this._settings.set_boolean(this._settingsKey.SHOW_NOTIFICATIONS, widget.get_active());
        });
        this._settings.bind(this._settingsKey.INDICATOR_POSITION,
            this.posIndicatorOffsetButton, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect(`changed::${this._settingsKey.INDICATOR_POS_MAX}`, this._updatePosMax.bind(this));
    }

    _updatePosMax() {
        this.lastIndicatorPos = this._settings.get_int(this._settingsKey.INDICATOR_POS_MAX);
        this.posIndicatorOffsetButton.adjustment.set_upper(this.lastIndicatorPos);
    }
});
