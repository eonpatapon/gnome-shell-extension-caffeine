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
/* exported CaffeinePrefs */
'use strict';

import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

// Import preferences pages
import * as GeneralPrefs from './preferences/generalPage.js';
import * as DisplayPrefs from './preferences/displayPage.js';
import * as TimerPrefs from './preferences/timerPage.js';
import * as AppsPrefs from './preferences/appsPage.js';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SettingsKey = {
    INHIBIT_APPS: 'inhibit-apps',
    SHOW_INDICATOR: 'show-indicator',
    SHOW_NOTIFICATIONS: 'show-notifications',
    SHOW_TIMER: 'show-timer',
    SHOW_TOGGLE: 'show-toggle',
    DURATION_TIMER_INDEX: 'duration-timer',
    DURATION_TIMER_LIST: 'duration-timer-list',
    USE_CUSTOM_DURATION: 'use-custom-duration',
    FULLSCREEN: 'enable-fullscreen',
    MPRIS: 'enable-mpris',
    RESTORE: 'restore-state',
    NIGHT_LIGHT: 'nightlight-control',
    TOGGLE_SHORTCUT: 'toggle-shortcut',
    DEFAULT_WIDTH: 'prefs-default-width',
    DEFAULT_HEIGHT: 'prefs-default-height',
    SCREEN_BLANK: 'screen-blank',
    TRIGGER_APPS_MODE: 'trigger-apps-mode',
    INDICATOR_POSITION: 'indicator-position',
    INDICATOR_INDEX: 'indicator-position-index',
    INDICATOR_POS_MAX: 'indicator-position-max'
};

export default class CaffeinePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_search_path().includes(this.path + '/icons')) {
            iconTheme.add_search_path(this.path + '/icons');
        }

        const settings = this.getSettings();
        const generalPage = new GeneralPrefs.GeneralPage(settings, SettingsKey);
        const displayPage = new DisplayPrefs.DisplayPage(settings, SettingsKey);
        const timerPage = new TimerPrefs.TimerPage(settings, SettingsKey);
        const appsPage = new AppsPrefs.AppsPage(settings, SettingsKey);

        let prefsWidth = settings.get_int(SettingsKey.DEFAULT_WIDTH);
        let prefsHeight = settings.get_int(SettingsKey.DEFAULT_HEIGHT);

        window.set_default_size(prefsWidth, prefsHeight);
        window.set_search_enabled(true);

        window.add(generalPage);
        window.add(displayPage);
        window.add(timerPage);
        window.add(appsPage);

        window.connect('close-request', () => {
            let currentWidth = window.default_width;
            let currentHeight = window.default_height;
            // Remember user window size adjustments.
            if (currentWidth !== prefsWidth || currentHeight !== prefsHeight) {
                settings.set_int(SettingsKey.DEFAULT_WIDTH, currentWidth);
                settings.set_int(SettingsKey.DEFAULT_HEIGHT, currentHeight);
            }
            window.destroy();
        });
    }
}
