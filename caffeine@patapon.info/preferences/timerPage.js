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
import Gio from 'gi://Gio';

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
            title: _('Preset durations'),
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
        this.sliderTimer.add_mark(0, Gtk.PositionType.BOTTOM, null);
        this.sliderTimer.add_mark(1, Gtk.PositionType.BOTTOM, null);
        this.sliderTimer.add_mark(2, Gtk.PositionType.BOTTOM, null);
        this.sliderTimer.add_mark(3, Gtk.PositionType.BOTTOM, null);
        this.sliderTimer.add_mark(4, Gtk.PositionType.BOTTOM, null);
        this.timerOptionRow.add_suffix(this.sliderTimer);

        // Add elements
        timerGroup.add(this.timerOptionRow);
        this.add(timerGroup);

        // Custom value group
        // --------------
        this.resetCustomTimerButton = new Gtk.Button({
            //icon_name: 'view-refresh-symbolic',
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['error'],
            hexpand: false,
            vexpand: false
        });

        let customDurationGroup = new Adw.PreferencesGroup({
            title: _('Custom durations'),
            header_suffix: this.resetCustomTimerButton
        });

        // Custom value Adw.spinRow
        const maxValueSecond = 359940 // = 99 Hours, 99 minutes
        this.shortTimerSelector = this.timerSpinRow(
            'Short timer: ',
            60,
            this._settings.get_int(this._settingsKey.DURATION_TIMER_SHORT),
            60, 
            maxValueSecond - 60*2
        );
        this.mediumTimerSelector = this.timerSpinRow(
            'Medium timer: ',
            60,
            this._settings.get_int(this._settingsKey.DURATION_TIMER_MEDIUM),
            60*2,
            maxValueSecond - 60
        );
        this.longTimerSelector = this.timerSpinRow(
            'Long timer: ', 
            60,
            this._settings.get_int(this._settingsKey.DURATION_TIMER_LONG),
            60*3,
            maxValueSecond
        );

        // Enable / Disable Custom value
        let enableCustomTimerSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)
        });
        this.enableCustomTimerRow = new Adw.ActionRow({
            title: _('Enable custom values'),
            subtitle: _('Select custom value for each duration'),
            activatable_widget: enableCustomTimerSwitch
        });
        this.enableCustomTimerRow.add_suffix(enableCustomTimerSwitch);

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
        enableCustomTimerSwitch.connect('notify::active', (widget) => {
            this._settings.set_boolean(this._settingsKey.USE_CUSTOM_DURATION, widget.get_active());
            this._activeCustomvalue();
        });
        this.sliderTimer.connect('change-value',
            (widget) => this._updateTimerDuration(widget.get_value()));
        this.resetCustomTimerButton.connect('clicked', (widget) => {
            this._updateCustomDurationFromIndex(this.sliderTimer.get_value());
        });
        this.shortTimerSelector.connect('notify::value', (widget) => {
            this._settings.set_int(this._settingsKey.DURATION_TIMER_SHORT, widget.get_value());
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const shortValue = this.shortTimerSelector.get_value();
            const mediumValue = this.mediumTimerSelector.get_value();
            if(shortValue >= mediumValue){
                this.mediumTimerSelector.set_value(shortValue + 60);
            }
        });
        this.mediumTimerSelector.connect('notify::value', (widget) => {
            this._settings.set_int(this._settingsKey.DURATION_TIMER_MEDIUM, widget.get_value());
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const shortValue = this.shortTimerSelector.get_value();
            const mediumValue = this.mediumTimerSelector.get_value();
            const longValue = this.longTimerSelector.get_value();
            if(mediumValue <= shortValue){
                this.shortTimerSelector.set_value(mediumValue - 60);
            }
            if(mediumValue >= longValue){
                this.longTimerSelector.set_value(mediumValue + 60);
            }
        });
        this.longTimerSelector.connect('notify::value', (widget) => {
            this._settings.set_int(this._settingsKey.DURATION_TIMER_LONG, widget.get_value());
            this._updateResetButtonState();
            // Control hierarchy of custom duration
            const mediumValue = this.mediumTimerSelector.get_value();
            const longValue = this.longTimerSelector.get_value();
            if(longValue <= mediumValue){
                this.mediumTimerSelector.set_value(longValue - 60);
            }
        });
    }

    _isCustomValueSet() {
        const shortValue = this.shortTimerSelector.get_value();
        const mediumValue = this.mediumTimerSelector.get_value();
        const longValue = this.longTimerSelector.get_value();
        const durationIndex = this.sliderTimer.get_value();
        let isCustomed = false; 
        if (shortValue != parseInt(TIMERS_DURATION[durationIndex][0])*60) {
            isCustomed = true;
        }
        if (mediumValue != parseInt(TIMERS_DURATION[durationIndex][1])*60) {
            isCustomed = true;
        }
        if (longValue != parseInt(TIMERS_DURATION[durationIndex][2])*60) {
            isCustomed = true;
        }
        return isCustomed;
    }

    _updateTimerDuration(value) {
        const durationIndex = this._settings.get_int(this._settingsKey.DURATION_TIMER_INDEX);
        this.timerOptionRow.set_subtitle(_('Set to ') 
            + TIMERS_DURATION[value][0] + ', '
            + TIMERS_DURATION[value][1] + ', '
            + TIMERS_DURATION[value][2] + _(' minutes'));
        if (durationIndex !== value) {
            this._settings.set_int(this._settingsKey.DURATION_TIMER_INDEX, value);
        }
        if(!this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)) {
            this._updateCustomDurationFromIndex(value);
        }
    }

    _updateCustomDurationFromIndex(value) {
        this.shortTimerSelector.set_value(TIMERS_DURATION[value][0]*60);
        this.mediumTimerSelector.set_value(TIMERS_DURATION[value][1]*60);
        this.longTimerSelector.set_value(TIMERS_DURATION[value][2]*60);
    }

    _updateResetButtonState() {
        if (this._isCustomValueSet()) {
            this.resetCustomTimerButton.visible = true;
        }
        else {
            this.resetCustomTimerButton.visible = false;
        }
    }

    _activeCustomvalue() {
        if(this._settings.get_boolean(this._settingsKey.USE_CUSTOM_DURATION)) {
            this.sliderTimer.set_sensitive(false);
            this.shortTimerSelector.set_sensitive(true);
            this.mediumTimerSelector.set_sensitive(true);
            this.longTimerSelector.set_sensitive(true);
        }
        else {
            this.sliderTimer.set_sensitive(true);
            this.shortTimerSelector.set_sensitive(false);
            this.mediumTimerSelector.set_sensitive(false);
            this.longTimerSelector.set_sensitive(false);
            this._updateTimerDuration(this.sliderTimer.get_value());
        }
    }

    timerSpinRow(name, step, value, minValue, maxValue) {
        let spin_row = new Adw.SpinRow({
            title: name,
            climb_rate: 0,
            adjustment: new Gtk.Adjustment({
                lower: minValue,
                upper: maxValue,
                step_increment: step,
                page_increment: 960,
                value: value
            }),
            snap_to_ticks: true
        });

        // Create new editable label
        let time_text = new Gtk.Text({
            editable: true,
            hexpand: true,
            halign: Gtk.Align.END,
            max_width_chars: 8,
            buffer: new Gtk.EntryBuffer({
                max_length: 8,
                text: '00:00:00'
            }),
        });

        /*
        * Tweak Adw.SpinRow
        *
        *     For some reasons, the output of the Gtk.Text from SpinRow can't be 
        * modified using 'set_text()' without a bug with single increment. 
        * Similar problem to this one: 
        * https://stackoverflow.com/questions/61753800/formatting-gtk-spinbuttons-output-does-not-work-for-single-mouse-clicks
        *
        *     The workaround is to create a new separate Gtk.Text to display HH:MM:SS
        * and hide the original.
        */

        // Get the Gtk.SpinButton and Gtk.Text
        let child_widget = spin_row.get_last_child();
        let box_widget = child_widget.get_last_child();
        let spin_button_widget = box_widget.get_first_child();
        let spin_button_text = spin_button_widget.get_first_child();

        // Hide the current text input
        spin_button_text.visible = false;

        // Add the new text input an re-order properly the widget component
        spin_row.remove(spin_button_widget);
        spin_button_widget.set_property('halign',Gtk.Align.END);
        spin_button_widget.set_property('hexpand',false);
        spin_row.add_suffix(time_text);
        spin_row.add_suffix(spin_button_widget);
        
        let buffer = time_text.get_buffer();

        // Display duration value as HH:MM:SS
        spin_row.connect('output', () => {
            let value = spin_row.get_value();
            let hours = Math.floor(value / 3600);
            let minutes = Math.floor((value % 3600) / 60);
            let seconds = Math.floor(value % 60);
            let newText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (buffer.get_text() !== newText){
                buffer.set_text(newText,8);
            }
        });

        // Update value from the new text entry
        buffer.connect('inserted-text', () => {
            let text = time_text.get_buffer().get_text();
            let [hh, mm, ss] = text.split(':').map(Number);
            let value = hh * 3600 + mm * 60 + ss;
            if(spin_row.get_value() !== value){
                spin_row.set_value(value);
            }
        });
        return spin_row;
    }
});
