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

   Copyright 2024 Pakaoraki

   // From https://gitlab.com/skrewball/openweather/-/blob/master/src/prefs.js
*/
/* exported TimerPage */
'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const TIMERS_DURATION = [
    ['05', '10', '30'],
    ['10', '20', '45'],
    ['15', '30', '60'],
    ['20', '40', '75'],
    ['30', '50', '80']
];

export var TimerPage = GObject.registerClass(
class CaffeineTimerPage extends Adw.PreferencesPage {
    _init(settings, settingsKey) {
        super._init({
            title: _('Timer'),
            icon_name: 'stopwatch-symbolic',
            name: 'TimerPage'
        });
        this._settings = settings;
        this._settingsKey = settingsKey;

        // Timer group
        // --------------
        let timerGroup = new Adw.PreferencesGroup({
            title: _('Preset durations')
        });

        // Slider
        const durationIndex = this._settings.get_int(this._settingsKey.DURATION_TIMER_INDEX);
        this.timerOptionRow = new Adw.ActionRow({
            title: _('Durations'),
            activatable: true
        });

        let adjustSliderTimer = new Gtk.Adjustment({
            lower: 0,
            upper: 4,
            step_increment: 0.1,
            page_increment: 1,
            value: durationIndex
        });

        this.sliderTimer = new Gtk.Scale({
            valign: 'center',
            hexpand: true,
            width_request: '200px',
            round_digits: false,
            draw_value: false,
            orientation: 'horizontal',
            digits: 0,
            adjustment: adjustSliderTimer
        });
        for (let index = 0; index < 5; index++) {
            this.sliderTimer.add_mark(index, Gtk.PositionType.BOTTOM, null);
        }
        this.timerOptionRow.add_suffix(this.sliderTimer);

        // Add elements
        timerGroup.add(this.timerOptionRow);
        this.add(timerGroup);

        // Custom value group
        // --------------
        this.resetCustomTimerButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false
        });

        let customDurationGroup = new Adw.PreferencesGroup({
            title: _('Custom durations'),
            header_suffix: this.resetCustomTimerButton
        });

        // Custom value Adw.spinRow
        const maxValueSecond = 359940; // = 99 Hours, 99 minutes
        const variantDuration = this._settings.get_value(this._settingsKey.DURATION_TIMER_LIST);
        const durationValues = variantDuration.deepUnpack();
        this.shortTimerSelector = this.timerSpinRow(_('Short timer'),
            60,
            durationValues[0], // Short duration
            60,
            maxValueSecond - 60 * 2);
        this.mediumTimerSelector = this.timerSpinRow(_('Medium timer'),
            60,
            durationValues[1], // Medium duration
            60 * 2,
            maxValueSecond - 60);
        this.longTimerSelector = this.timerSpinRow(_('Long timer'),
            60,
            durationValues[2], // Long duration
            60 * 3,
            maxValueSecond);

        // Enable / Disable Custom value
        this.enableCustomTimerRow = new Adw.SwitchRow({
            title: _('Enable custom values'),
            subtitle: _('Select custom value for each duration'),
            active: this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)
        });

        // Add elements
        customDurationGroup.add(this.enableCustomTimerRow);
        customDurationGroup.add(this.shortTimerSelector);
        customDurationGroup.add(this.mediumTimerSelector);
        customDurationGroup.add(this.longTimerSelector);
        this.add(customDurationGroup);

        // Init
        this._activeCustomvalue();
        this._updateTimerDuration(durationIndex);
        this._updateResetButtonState();

        // Bind signals
        // --------------
        this.enableCustomTimerRow.connect('notify::active', (widget) => {
            this._settings.set_boolean(this._settingsKey.USE_CUSTOM_DURATION, widget.get_active());
            this._activeCustomvalue();
        });
        this.sliderTimer.connect('change-value',
            (widget) => this._updateTimerDuration(widget.get_value()));
        this.resetCustomTimerButton.connect('clicked', () => {
            this._updateCustomDurationFromIndex(this.sliderTimer.get_value());
        });
        this.shortTimerSelector.connect('notify::value', (widget) => {
            this._updateDurationVarian(widget.get_value(), 0);
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const shortValue = this.shortTimerSelector.get_value();
            const mediumValue = this.mediumTimerSelector.get_value();
            if (shortValue >= mediumValue) {
                this.mediumTimerSelector.set_value(shortValue + 60);
            }
        });
        this.mediumTimerSelector.connect('notify::value', (widget) => {
            this._updateDurationVarian(widget.get_value(), 1);
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const shortValue = this.shortTimerSelector.get_value();
            const mediumValue = this.mediumTimerSelector.get_value();
            const longValue = this.longTimerSelector.get_value();
            if (mediumValue <= shortValue) {
                this.shortTimerSelector.set_value(mediumValue - 60);
            }
            if (mediumValue >= longValue) {
                this.longTimerSelector.set_value(mediumValue + 60);
            }
        });
        this.longTimerSelector.connect('notify::value', (widget) => {
            this._updateDurationVarian(widget.get_value(), 2);
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const mediumValue = this.mediumTimerSelector.get_value();
            const longValue = this.longTimerSelector.get_value();
            if (longValue <= mediumValue) {
                this.mediumTimerSelector.set_value(longValue - 60);
            }
        });
    }

    _isCustomValueSet() {
        const selectors = [this.shortTimerSelector, this.mediumTimerSelector, this.longTimerSelector];
        const durationIndex = this.sliderTimer.get_value();
        let isCustom = false;
        for (const [i, selector] of selectors.entries()) {
            if (selector.get_value() !== parseInt(TIMERS_DURATION[durationIndex][i]) * 60) {
                isCustom = true;
                break;
            }
        }
        return isCustom;
    }

    _updateTimerDuration(value) {
        const durationIndex = this._settings.get_int(this._settingsKey.DURATION_TIMER_INDEX);
        this.timerOptionRow.set_subtitle(_('Set to ') +
            TIMERS_DURATION[value][0] + ', ' +
            TIMERS_DURATION[value][1] + ', ' +
            TIMERS_DURATION[value][2] + _(' minutes'));
        if (durationIndex !== value) {
            this._settings.set_int(this._settingsKey.DURATION_TIMER_INDEX, value);
        }
        if (!this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)) {
            this._updateCustomDurationFromIndex(value);
        }
    }

    _updateDurationVarian(value, index) {
        const variantDuration = this._settings.get_value(this._settingsKey.DURATION_TIMER_LIST);
        let currentDurationValues = variantDuration.deepUnpack();
        currentDurationValues[index] = value;
        const newVariant = new GLib.Variant('ai', currentDurationValues);
        this._settings.set_value(this._settingsKey.DURATION_TIMER_LIST, newVariant);
    }

    _updateCustomDurationFromIndex(value) {
        this.shortTimerSelector.set_value(TIMERS_DURATION[value][0] * 60);
        this.mediumTimerSelector.set_value(TIMERS_DURATION[value][1] * 60);
        this.longTimerSelector.set_value(TIMERS_DURATION[value][2] * 60);
    }

    _updateResetButtonState() {
        if (this._isCustomValueSet()) {
            this.resetCustomTimerButton.visible = true;
        } else {
            this.resetCustomTimerButton.visible = false;
        }
    }

    _activeCustomvalue() {
        if (this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)) {
            this.timerOptionRow.set_sensitive(false);
            this.shortTimerSelector.set_sensitive(true);
            this.mediumTimerSelector.set_sensitive(true);
            this.longTimerSelector.set_sensitive(true);
        } else {
            this.timerOptionRow.set_sensitive(true);
            this.shortTimerSelector.set_sensitive(false);
            this.mediumTimerSelector.set_sensitive(false);
            this.longTimerSelector.set_sensitive(false);
            this._updateTimerDuration(this.sliderTimer.get_value());
        }
    }

    timerSpinRow(name, step, value, minValue, maxValue) {
        /*
        * Tweak Adw.SpinRow
        *
        *     For some reasons, the output of the Gtk.Text from SpinRow can't be
        * modified using 'set_text()' without a bug with single increment.
        * Similar problem to this one:
        * https://stackoverflow.com/questions/61753800/formatting-gtk-spinbuttons-output-does-not-work-for-single-mouse-clicks
        *
        *     The workaround is to create a new separate Gtk.Entry to display HH:MM:SS
        * and hide the original Gtk.Text.
        */

        // Create the SpinRow
        let spinRowAdjustment = new Gtk.Adjustment({
            lower: minValue,
            upper: maxValue,
            step_increment: step,
            page_increment: 960,
            value
        });

        let spinRow = new Adw.SpinRow({
            title: name,
            climb_rate: 0,
            adjustment: spinRowAdjustment,
            snap_to_ticks: true
        });

        // Create new Entry
        let timeEntry = new Gtk.Entry({
            editable: true,
            hexpand: true,
            halign: Gtk.Align.END,
            max_width_chars: 8,
            max_length: 8,
            margin_top: 8,
            margin_bottom: 8,
            has_frame: false
        });

        // Get the Gtk.SpinButton and Gtk.Text
        let childWidget = spinRow.get_last_child();
        let boxWidget = childWidget.get_last_child();
        let spinButtonWidget = boxWidget.get_first_child();
        let spinButtonText = spinButtonWidget.get_first_child();

        // Hide the current text input
        spinButtonText.visible = false;

        // Add the new text input an re-order properly the widget component
        spinRow.remove(spinButtonWidget);
        spinButtonWidget.set_property('halign', Gtk.Align.END);
        spinButtonWidget.set_property('hexpand', false);
        spinRow.add_suffix(timeEntry);
        spinRow.add_suffix(spinButtonWidget);

        // Display duration value as HH:MM:SS
        spinRow.connect('output', () => {
            const currentValue = spinRow.get_value();
            const hours = Math.floor(currentValue / 3600);
            const minutes = Math.floor((currentValue % 3600) / 60);
            const seconds = Math.floor(currentValue % 60);
            const newText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (spinRow.get_text() !== newText) {
                timeEntry.set_text(newText);
            }
        });

        // Update value from the new text entry
        timeEntry.connect('changed', () => {
            const text = timeEntry.get_text();
            if ((text !== '') && (text !== null)) {
                const [hh, mm, ss] = text.split(':').map(Number);
                const currentValue = parseInt(hh * 3600 + mm * 60 + ss);
                if ((spinRow.get_value() !== currentValue) && currentValue !== null) {
                    spinRow.set_value(currentValue);
                }
            }
        });
        return spinRow;
    }
});
