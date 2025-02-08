/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
/* jshint multistr:true */
/* jshint esnext:true */
/* exported CaffeineExtension */
/**
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 **/

'use strict';

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
const QuickSettingsMenu = Main.panel.statusArea.quickSettings;
const ShellVersion = parseFloat(Config.PACKAGE_VERSION);

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const SHOW_TIMER_KEY = 'show-timer';
const DURATION_TIMER_LIST = 'duration-timer-list';
const TOGGLE_STATE_KEY = 'toggle-state';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const NIGHT_LIGHT_KEY = 'nightlight-control';
const TOGGLE_SHORTCUT = 'toggle-shortcut';
const TIMER_KEY = 'countdown-timer';
const SCREEN_BLANK = 'screen-blank';
const TRIGGER_APPS_MODE = 'trigger-apps-mode';
const INDICATOR_POSITION = 'indicator-position';
const INDICATOR_INDEX = 'indicator-position-index';
const INDICATOR_POS_MAX = 'indicator-position-max';

const ColorInterface = '<node> \
  <interface name="org.gnome.SettingsDaemon.Color"> \
    <property name="DisabledUntilTomorrow" type="b" access="readwrite"/>\
    <property name="NightLightActive" type="b" access="read"/>\
  </interface>\
  </node>';

const ColorProxy = Gio.DBusProxy.makeProxyWrapper(ColorInterface);

const DBusSessionManagerIface = '<node>\
  <interface name="org.gnome.SessionManager">\
    <method name="Inhibit">\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="s" direction="in" />\
        <arg type="u" direction="in" />\
        <arg type="u" direction="out" />\
    </method>\
    <method name="Uninhibit">\
        <arg type="u" direction="in" />\
    </method>\
       <method name="GetInhibitors">\
           <arg type="ao" direction="out" />\
       </method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
        <arg type="o" direction="out" />\
    </signal>\
  </interface>\
</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = '<node>\
  <interface name="org.gnome.SessionManager.Inhibitor">\
    <method name="GetAppId">\
        <arg type="s" direction="out" />\
    </method>\
  </interface>\
</node>';

const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const ActionsPath = '/icons/hicolor/scalable/actions/';
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';
const TimerMenuIcon = 'stopwatch-symbolic';
const TimerIcons = [
    'caffeine-short-timer-symbolic',
    'caffeine-medium-timer-symbolic',
    'caffeine-long-timer-symbolic',
    'caffeine-infinite-timer-symbolic'
];

const ControlContext = {
    NEVER: 0,
    ALWAYS: 1,
    FOR_APPS: 2
};

const ShowIndicator = {
    ONLY_ACTIVE: 0,
    ALWAYS: 1,
    NEVER: 2
};

const AppsTrigger = {
    ON_RUNNING: 0,
    ON_FOCUS: 1,
    ON_ACTIVE_WORKSPACE: 2
};

const CaffeineToggle = GObject.registerClass(
class CaffeineToggle extends QuickSettings.QuickMenuToggle {
    _init(Me) {
        super._init({
            'title': _('Caffeine'),
            toggleMode: true
        });

        this._settings = Me._settings;
        this._path = Me.path;

        // Icons
        this.finalTimerMenuIcon = TimerMenuIcon;
        this._iconActivated = Gio.ThemedIcon.new(EnabledIcon);
        this._iconDeactivated = Gio.ThemedIcon.new(DisabledIcon);
        this._iconTheme = new St.IconTheme();
        if (!this._iconTheme.has_icon(TimerMenuIcon)) {
            this.finalTimerMenuIcon =
                Gio.icon_new_for_string(`${this._path}${ActionsPath}${TimerMenuIcon}.svg`);
        }
        if (!this._iconTheme.has_icon(EnabledIcon)) {
            this._iconActivated = Gio.icon_new_for_string(`${this._path}${ActionsPath}${EnabledIcon}.svg`);
        }
        if (!this._iconTheme.has_icon(DisabledIcon)) {
            this._iconDeactivated = Gio.icon_new_for_string(`${this._path}${ActionsPath}${DisabledIcon}.svg`);
        }
        this._iconName();

        // Menu
        this.menu.setHeader(this.finalTimerMenuIcon, _('Caffeine Timer'), null);

        // Add elements
        this._itemsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._itemsSection);

        // Add an entry-point for more settings
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = this.menu.addAction(_('Settings'), () => Me._openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[Me.uuid] = settingsItem;

        // Init Timers
        this._timerItems = new Map();
        this._syncTimers(false);

        // Bind signals
        this._settings.bind(`${TOGGLE_STATE_KEY}`,
            this, 'checked',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.connectObject(
            `changed::${TOGGLE_STATE_KEY}`,
            () => this._iconName(),
            `changed::${TIMER_KEY}`,
            () => this._sync(),
            `changed::${DURATION_TIMER_LIST}`,
            () => this._syncTimers(true),
            this);
        this.connect('destroy', () => {
            this._iconActivated = null;
            this._iconDeactivated = null;
            this.gicon = null;
        });
    }

    _syncTimers(resetDefault) {
        this._itemsSection.removeAll();
        this._timerItems.clear();
        // Get duration list and add '0' for the 'infinite' entry (no timer)
        let durationValues = this._settings.get_value(DURATION_TIMER_LIST).deepUnpack();
        durationValues.push(0);

        // Create menu timer
        for (const [index, timer] of durationValues.entries()) {
            let label = null;
            if (timer === 0) {
                label = _('Infinite');
            } else {
                let hours = Math.floor(timer / 3600);
                let minutes = Math.floor((timer % 3600) / 60);
                switch (hours) {
                case 0:
                    break;
                case 1:
                    label = hours + _(' hour ');
                    break;
                default:
                    label = hours + _(' hours ');
                    break;
                }
                switch (minutes) {
                case 0:
                    break;
                case 1:
                    label = label + minutes + _(' minute');
                    break;
                default:
                    label = label + minutes + _(' minutes');
                    break;
                }
            }
            if (!label) {
                continue;
            }
            let icon = Gio.ThemedIcon.new(TimerIcons[index]);
            if (!this._iconTheme.has_icon(TimerIcons[index])) {
                icon = Gio.icon_new_for_string(`${this._path}${ActionsPath}${TimerIcons[index]}.svg`);
            }
            const item = new PopupMenu.PopupImageMenuItem(label, icon);
            item.connectObject('activate', () => this._checkTimer(timer), this);
            this._timerItems.set(timer, item);
            this._itemsSection.addMenuItem(item);
        }

        // Select active duration
        if (resetDefault && this._settings.get_int(TIMER_KEY) !== 0) {
            // Set default duration to 0
            this._settings.set_int(TIMER_KEY, 0);
        } else {
            this._sync();
        }
    }

    _sync() {
        const activeTimerId = this._settings.get_int(TIMER_KEY);
        for (const [timerId, item] of this._timerItems) {
            item.setOrnament(timerId === activeTimerId
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
        }
    }

    _checkTimer(timerId) {
        this._settings.set_int(TIMER_KEY, timerId);
        this._settings.set_boolean(TOGGLE_STATE_KEY, true);
    }

    _iconName() {
        if (this._settings.get_boolean(TOGGLE_STATE_KEY)) {
            this.gicon = this._iconActivated;
        } else {
            this.gicon = this._iconDeactivated;
        }
    }
});

const Caffeine = GObject.registerClass(
class Caffeine extends QuickSettings.SystemIndicator {
    _init(Me) {
        super._init();

        this._indicator = this._addIndicator();
        this._settings = Me._settings;
        this._name = Me.metadata.name;

        // D-bus
        this._proxy = new ColorProxy(
            Gio.DBus.session,
            'org.gnome.SettingsDaemon.Color',
            '/org/gnome/SettingsDaemon/Color',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                }
            }
        );
        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager');

        // From auto-move-windows@gnome-shell-extensions.gcampax.github.com
        this._appSystem = Shell.AppSystem.get_default();
        this._activeWorkspace = null;

        // Init Apps Signals Id
        this._appStateChangedSignalId = null;
        this._appDisplayChangedSignalId = null;
        this._appWorkspaceChangedSignalId = null;
        this._appAddWindowSignalId = null;
        this._appRemoveWindowSignalId = null;

        // Add indicator label for the timer
        this._timerLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._timerLabel.visible = false;
        this.add_child(this._timerLabel);

        // Icons
        this._iconActivated = Gio.ThemedIcon.new(EnabledIcon);
        this._iconDeactivated = Gio.ThemedIcon.new(DisabledIcon);
        this._iconTheme = new St.IconTheme();
        if (!this._iconTheme.has_icon(EnabledIcon)) {
            this._iconActivated = Gio.icon_new_for_string(`${Me.path}${ActionsPath}${EnabledIcon}.svg`);
        }
        if (!this._iconTheme.has_icon(DisabledIcon)) {
            this._iconDeactivated = Gio.icon_new_for_string(`${Me.path}${ActionsPath}${DisabledIcon}.svg`);
        }
        this._indicator.gicon = this._iconDeactivated;

        // Manage night light
        this._nightLight = false;

        /* Inhibited flag value
        * - 4: Inhibit suspending the session or computer
        * - 12: Inhibit the session being marked as idle
        */
        this.inhibitFlags = 12;

        // Caffeine state
        this._state = false;
        this._userState = false;

        // Store the inhibition requests until processed
        this._inhibitionAddedFifo = [];
        this._inhibitionRemovedFifo = [];

        // Init inhibitor signals
        this._inhibitorAddedId = null;
        this._inhibitorRemovedId = null;

        // Init Timers
        this._timeOut = null;
        this._timePrint = null;
        this._timerEnable = false;
        this._timeFullscreen = null;
        this._timeWorkspaceAdd = null;
        this._timeWorkspaceRemove = null;
        this._timeAppUnblock = null;

        // Show icon
        this._manageShowIndicator();

        // Init app list
        this._appConfigs = [];
        this._appInhibitedData = new Map();
        this._updateAppConfigs();

        // Enable caffeine when fullscreen app is running
        if (this._settings.get_boolean(FULLSCREEN_KEY)) {
            global.display.connectObject('in-fullscreen-changed',
                () => this.toggleFullscreen(), this);
            this.toggleFullscreen();
        }

        // QuickSettings
        this._caffeineToggle = new CaffeineToggle(Me);
        this.quickSettingsItems.push(this._caffeineToggle);
        this._updateTimerSubtitle();

        // Init settings keys and restore user state
        this._settings.reset(TOGGLE_STATE_KEY);
        if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY)) {
            this.toggleState();
        } else {
            // reset user state
            this._settings.reset(USER_ENABLED_KEY);
        }

        // Bind signals
        this._inhibitorAddedId = this._sessionManager.connectSignal('InhibitorAdded',
            this._inhibitorAdded.bind(this));
        this._inhibitorRemovedId = this._sessionManager.connectSignal('InhibitorRemoved',
            this._inhibitorRemoved.bind(this));
        this._settings.connectObject(
            `changed::${INHIBIT_APPS_KEY}`,
            () => this._updateAppConfigs(),
            `changed::${TOGGLE_STATE_KEY}`,
            () => this._updateMainState(),
            `changed::${TIMER_KEY}`,
            () => this._startTimer(),
            `changed::${SHOW_TIMER_KEY}`,
            () => this._showIndicatorLabel(),
            `changed::${INDICATOR_POSITION}`,
            () => this._updateIndicatorPosition(),
            `changed::${SHOW_INDICATOR_KEY}`,
            () => {
                this._manageShowIndicator();
                this._showIndicatorLabel();
            },
            `changed::${TRIGGER_APPS_MODE}`,
            () => {
                this._resetAppSignalId();
                this._updateAppEventMode();
            },
            this);

        if (ShellVersion >= 46) {
            QuickSettingsMenu._indicators.connectObject(
                'child-added', () => this._updateMaxPosition(),
                'child-removed', () => this._updateMaxPosition(),
                this);
        } else {
            QuickSettingsMenu._indicators.connectObject(
                'actor-added', () => this._updateMaxPosition(),
                'actor-removed', () => this._updateMaxPosition(),
                this);
        }

        // Change user state on icon scroll event
        this._indicator.reactive = true;
        this._indicator.connectObject('scroll-event',
            (actor, event) => this._handleScrollEvent(event), this);

        // Init position and index of indicator icon
        this.indicatorPosition = this._settings.get_int(INDICATOR_POSITION);
        this.indicatorIndex = this._settings.get_int(INDICATOR_INDEX);
        this.lastIndicatorPosition = this.indicatorPosition;

        // Add indicator and toggle
        QuickSettingsMenu.addExternalIndicator(this);
        if (ShellVersion >= 46) {
            QuickSettingsMenu._indicators.remove_child(this);
        } else {
            QuickSettingsMenu._indicators.remove_actor(this);
        }
        QuickSettingsMenu._indicators.insert_child_at_index(this, this.indicatorIndex);
    }

    get inFullscreen() {
        let nbMonitors = global.display.get_n_monitors();
        let inFullscreen = false;
        for (let i = 0; i < nbMonitors; i++) {
            if (global.display.get_monitor_in_fullscreen(i)) {
                inFullscreen = true;
                break;
            }
        }
        return inFullscreen;
    }

    toggleFullscreen() {
        /* Reset previous FullScreen delay
        * This prevent multiple inhibitors to be created in toggleFullscreen()
        * if a previous timer is still running.
        */
        if (this._timeFullscreen !== null) {
            GLib.Source.remove(this._timeFullscreen);
            this._timeFullscreen = null;
        }

        this._manageScreenBlankState(false);

        // Add 2 second delay before adding inhibitor
        this._timeFullscreen = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (this.inFullscreen && !this._appInhibitedData.has('fullscreen')) {
                this.addInhibit('fullscreen');
                this._manageNightLight(false, false);
            }

            this._timeFullscreen = null;
            return GLib.SOURCE_REMOVE;
        });

        if (!this.inFullscreen && this._appInhibitedData.has('fullscreen')) {
            this.removeInhibit('fullscreen');
            this._manageNightLight(true, false);
        }
    }

    toggleState() {
        this._manageScreenBlankState(false);
        if (this._state) {
            this._removeTimer();
            this._appInhibitedData.forEach((data, appId) =>
                this.removeInhibit(appId)
            );
            this._manageNightLight(true, false);
        } else {
            this.addInhibit('user');
            this._manageNightLight(false, false);

            // Enable timer when duration isn't null
            if (this._settings.get_int(TIMER_KEY) !== 0 && !this._timerEnable) {
                this._startTimer();
            }
        }
        this._updateMaxPosition();
    }

    addInhibit(appId) {
        this._sessionManager.InhibitRemote(appId,
            0, 'Inhibit by %s'.format(this._name), this.inhibitFlags,
            (cookie) => {
                this._inhibitionAddedFifo.push(appId);
                // Init app data
                let data = {
                    cookie,
                    isToggled: true,
                    isInhibited: false,
                    object: ''
                };
                this._appInhibitedData.set(appId, data);
            }
        );
    }

    removeInhibit(appId) {
        let appData = this._appInhibitedData.get(appId);
        if (appData && appData.isInhibited) {
            this._inhibitionRemovedFifo.push(appId);
            this._sessionManager.UninhibitRemote(appData.cookie);
            appData.isToggled = false;
            this._appInhibitedData.set(appId, appData);
        }
    }

    _incrementIndicatorPosIndex() {
        if (this.lastIndicatorPosition < this.indicatorPosition) {
            this.indicatorIndex += 1;
        } else {
            this.indicatorIndex -= 1;
        }
    }

    _updateMaxPosition() {
        let pos = -1;
        let indicators = QuickSettingsMenu._indicators.get_children();

        // Count visible items in the status area
        indicators.forEach((indicator) => {
            if (indicator.is_visible()) {
                pos += 1;
            }
        });

        this._settings.set_int(INDICATOR_POS_MAX, pos);
    }

    _updateIndicatorPosition() {
        const newPosition = this._settings.get_int(INDICATOR_POSITION);

        if (this.indicatorPosition !== newPosition) {
            this.indicatorPosition = newPosition;
            this._incrementIndicatorPosIndex();

            // Skip invisible indicator
            let targetIndicator =
                QuickSettingsMenu._indicators.get_child_at_index(this.indicatorIndex);
            let maxIndex = QuickSettingsMenu._indicators.get_n_children();
            while (this.indicatorIndex < maxIndex && !targetIndicator.is_visible() && this.indicatorIndex > -1) {
                this._incrementIndicatorPosIndex();
                targetIndicator =
                    QuickSettingsMenu._indicators.get_child_at_index(this.indicatorIndex);
            }

            // Always reset index to 0 on position 0
            if (this.indicatorPosition === 0) {
                this.indicatorIndex = 0;
            }

            // Update last position
            this.lastIndicatorPosition = newPosition;

            // Update indicator index
            if (ShellVersion >= 46) {
                QuickSettingsMenu._indicators.remove_child(this);
            } else {
                QuickSettingsMenu._indicators.remove_actor(this);
            }
            QuickSettingsMenu._indicators.insert_child_at_index(this, this.indicatorIndex);
            this._settings.set_int(INDICATOR_INDEX, this.indicatorIndex);
        }
        this._updateMaxPosition();
    }

    _showIndicatorLabel() {
        if (this._settings.get_boolean(SHOW_TIMER_KEY) &&
           (this._settings.get_enum(SHOW_INDICATOR_KEY) !== ShowIndicator.NEVER) &&
            this._timerEnable) {
            this._timerLabel.visible = true;
        } else {
            this._timerLabel.visible = false;
        }
    }

    _startTimer() {
        // Reset timer
        this._removeTimer();
        this._timerEnable = true;

        // Get duration
        let timerDelay = this._settings.get_int(TIMER_KEY);

        // Execute Timer only if duration isn't set on infinite time
        if (timerDelay !== 0) {
            let secondLeft = timerDelay;
            this._showIndicatorLabel();
            this._printTimer(secondLeft);
            this._timePrint = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                secondLeft -= 1;
                this._printTimer(secondLeft);
                return GLib.SOURCE_CONTINUE;
            });

            this._timeOut = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timerDelay * 1000, () => {
                // Disable Caffeine when timer ended
                this._removeTimer();
                this._settings.set_boolean(TOGGLE_STATE_KEY, false);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _printTimer(seconds) {
        const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const min = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        // Print Timer in system Indicator and Toggle menu subLabel
        if (hours !== '00') {
            this._updateLabelTimer(hours + ':' + min + ':' + sec);
        } else {
            this._updateLabelTimer(min + ':' + sec);
        }
    }

    _removeTimer() {
        // End timer
        this._timerEnable = false;

        // Flush and hide timer label
        this._updateLabelTimer(null);
        this._timerLabel.visible = false;

        // Remove timer
        if ((this._timeOut !== null) || (this._timePrint !== null)) {
            GLib.Source.remove(this._timeOut);
            GLib.Source.remove(this._timePrint);
            this._timeOut = null;
            this._timePrint = null;
        }
    }

    _updateLabelTimer(text) {
        this._timerLabel.text = text;
        this._caffeineToggle.menu.setHeader(this._caffeineToggle.finalTimerMenuIcon, _('Caffeine Timer'), text);
        this._caffeineToggle.subtitle = text;
    }

    _handleScrollEvent(event) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            if (!this._state) {
                // User state on - UP
                this._settings.set_boolean(TOGGLE_STATE_KEY, true);
            }
            break;
        case Clutter.ScrollDirection.DOWN:
            if (this._state) {
                // Stop timer
                this._removeTimer();
                // User state off - DOWN
                this._settings.set_boolean(TOGGLE_STATE_KEY, false);
            }
            break;
        }
    }

    _inhibitorAdded(proxy, sender, [object]) {
        this._sessionManager.GetInhibitorsRemote(([inhibitors]) => {
            // Get the first added request
            let requestedId = this._inhibitionAddedFifo.shift();

            for (let i of inhibitors) {
                let inhibitor = new DBusSessionManagerInhibitorProxy(Gio.DBus.session,
                    'org.gnome.SessionManager',
                    i);
                inhibitor.GetAppIdRemote((appId) => {
                    appId = String(appId);
                    let appData = this._appInhibitedData.get(appId);
                    if (appId !== '' && requestedId === appId && appData) {
                        appData.isInhibited = true;
                        appData.object = object;
                        this._appInhibitedData.set(appId, appData);

                        if (appId === 'user') {
                            this._saveUserState(true);
                        } else {
                            this._updateAppSubtitle(appId);
                        }

                        // Update state
                        if (this._state === false) {
                            this._saveMainState(true);
                            // Indicator icon
                            this._manageShowIndicator();
                            this._indicator.gicon = this._iconActivated;

                            // Shell OSD notifications
                            if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY) && !this.inFullscreen) {
                                this._sendOSDNotification(true);
                            }
                        }
                    }
                });
            }
        });
    }

    /* eslint-disable no-unused-vars */
    _inhibitorRemoved(proxy, sender, [object]) {
    /* eslint-enable no-unused-vars */
        // Get the first removed request
        let appId = this._inhibitionRemovedFifo.shift();

        if (appId) {
            let appData = this._appInhibitedData.get(appId);
            if (appData) {
                // Remove app from list
                this._appInhibitedData.delete(appId);

                if (appId === 'user') {
                    this._saveUserState(false);
                } else {
                    this._updateAppSubtitle(null);
                }

                // Update state
                if (this._appInhibitedData.size === 0) {
                    this._saveMainState(false);

                    // Indicator icon
                    this._manageShowIndicator();
                    this._indicator.gicon = this._iconDeactivated;

                    // Shell OSD notifications
                    if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY)) {
                        this._sendOSDNotification(false);
                    }
                }
            }
        }
    }

    _isToggleInhibited(appId) {
        let appData = this._appInhibitedData.get(appId);
        if (appData && appData.isToggled) {
            return true;
        } else {
            return false;
        }
    }

    _manageShowIndicator() {
        if (this._state) {
            this._indicator.visible = this._settings.get_enum(SHOW_INDICATOR_KEY) !== ShowIndicator.NEVER;
        } else {
            this._indicator.visible = this._settings.get_enum(SHOW_INDICATOR_KEY) === ShowIndicator.ALWAYS;
        }
    }

    _manageScreenBlankState(isApp) {
        let blankState = this._settings.get_enum(SCREEN_BLANK) === ControlContext.ALWAYS;
        if (isApp) {
            blankState = this._settings.get_enum(SCREEN_BLANK) > ControlContext.NEVER;
        }

        if (blankState) {
            this.inhibitFlags = 4;
        } else {
            this.inhibitFlags = 12;
        }
    }

    _manageNightLight(isEnable, isApp) {
        let nightLightPref = this._settings.get_enum(NIGHT_LIGHT_KEY) === ControlContext.ALWAYS;
        if (isApp) {
            nightLightPref = this._settings.get_enum(NIGHT_LIGHT_KEY) > ControlContext.NEVER;
        }
        if (isEnable && (nightLightPref || this._nightLight && this._proxy.DisabledUntilTomorrow)) {
            this._proxy.DisabledUntilTomorrow = false;
            this._nightLight = false;
        } else if (!isEnable && nightLightPref) {
            this._proxy.DisabledUntilTomorrow = true;
            this._nightLight = true;
        }
    }

    _sendOSDNotification(state) {
        const nightLightPref =
            this._settings.get_enum(NIGHT_LIGHT_KEY) !== ControlContext.NEVER;
        if (state) {
            let message = _('Caffeine enabled');
            if (nightLightPref && this._nightLight && this._proxy.NightLightActive) {
                message = message + '. ' + _('Night Light paused');
            }
            Main.osdWindowManager.show(-1, this._iconActivated,
                message, null, null);
        } else {
            let message = _('Caffeine disabled');
            if (nightLightPref && !this._nightLight && this._proxy.NightLightActive) {
                message = message + '. ' + _('Night Light resumed');
            }
            Main.osdWindowManager.show(-1, this._iconDeactivated,
                message, null, null);
        }
    }

    // Add the name of App as subtitle
    _updateAppSubtitle(id) {
        const listAppId = this._appInhibitedData.keys();
        let appId = id !== null ? id : listAppId.next().value;
        if (appId !== undefined) {
            let appInfo = Gio.DesktopAppInfo.new(appId);
            this._caffeineToggle.subtitle = appInfo !== null
                ? appInfo.get_display_name()
                : null;
        }
    }

    // Add the timer duration selected as subtitle
    _updateTimerSubtitle() {
        if (!this._settings.get_boolean(TOGGLE_STATE_KEY)) {
            const timerDuration = this._settings.get_int(TIMER_KEY);
            const hours = Math.floor(timerDuration / 3600);
            const min = Math.floor((timerDuration % 3600) / 60);
            let timeLabel = '';
            switch (hours) {
            case 0:
                break;
            case 1:
                timeLabel = hours + _(' hour ');
                break;
            default:
                timeLabel = hours + _(' hours ');
                break;
            }
            switch (min) {
            case 0:
                break;
            case 1:
                timeLabel += min + _(' minute ');
                break;
            default:
                timeLabel += min + _(' minutes ');
                break;
            }
            this._caffeineToggle.subtitle = timerDuration !== 0
                ? timeLabel
                : null;
        }
    }

    _updateAppConfigs() {
        this._appConfigs.length = 0;
        this._settings.get_strv(INHIBIT_APPS_KEY).forEach((appId) => {
            // Check if app still exist
            const appInfo = Gio.DesktopAppInfo.new(appId);
            if (appInfo) {
                this._appConfigs.push(appId);
            }
        });

        // Remove inhibited app that are not in the list anymore
        let inhibitedAppsToRemove = [...this._appInhibitedData.keys()]
            .filter((id) => !this._appConfigs.includes(id));
        inhibitedAppsToRemove.forEach((id) => {
            this._manageScreenBlankState(true); // Allow blank screen
            this._manageNightLight(true, true);
            this.removeInhibit(id); // Uninhibit app
        });

        this._updateAppEventMode();
    }

    _updateMainState() {
        if (this._settings.get_boolean(TOGGLE_STATE_KEY) !== this._state) {
            this.toggleState();
        }
        // Add timer duration as Subtitle when disable
        this._updateTimerSubtitle();
    }

    _saveUserState(state) {
        this._userState = state;
        this._settings.set_boolean(USER_ENABLED_KEY, state);
    }

    _saveMainState(state) {
        this._state = state;
        this._settings.set_boolean(TOGGLE_STATE_KEY, state);
    }

    _resetAppSignalId() {
        if (this._appStateChangedSignalId) {
            this._appSystem.disconnect(this._appStateChangedSignalId);
            this._appStateChangedSignalId = null;
        }
        if (this._appDisplayChangedSignalId) {
            global.display.disconnect(this._appDisplayChangedSignalId);
            this._appDisplayChangedSignalId = null;
        }
        if (this._appWorkspaceChangedSignalId) {
            global.workspace_manager.disconnect(this._appWorkspaceChangedSignalId);
            this._appWorkspaceChangedSignalId = null;
        }
        if (this._appAddWindowSignalId) {
            this._activeWorkspace.disconnect(this._appAddWindowSignalId);
            this._appAddWindowSignalId = null;
        }
        if (this._appRemoveWindowSignalId) {
            this._activeWorkspace.disconnect(this._appRemoveWindowSignalId);
            this._appRemoveWindowSignalId = null;
        }
    }

    _updateAppEventMode() {
        let appsTriggeredMode = this._settings.get_enum(TRIGGER_APPS_MODE);

        if (this._appConfigs.length === 0) {
            this._resetAppSignalId();
        } else {
            switch (appsTriggeredMode) {
            // TRIGGER APPS MODE: ON RUNNING
            case AppsTrigger.ON_RUNNING:
                if (!this._appStateChangedSignalId) {
                    this._appStateChangedSignalId =
                        this._appSystem.connect('app-state-changed',
                            this._appStateChanged.bind(this));
                }
                // Check if currently running App
                this._appConfigs.forEach((id) => {
                    let app = this._appSystem.lookup_app(id);
                    if (app && app.get_state() !== Shell.AppState.STOPPED) {
                        this._appStateChanged(this._appSystem, app);
                    }
                });
                break;
            // TRIGGER APPS MODE: ON FOCUS
            case AppsTrigger.ON_FOCUS:
                if (!this._appDisplayChangedSignalId) {
                    this._appDisplayChangedSignalId =
                        global.display.connect('notify::focus-window',
                            this._appWindowFocusChanged.bind(this));
                }
                // Check if currently focused App
                this._appWindowFocusChanged();
                break;
            // TRIGGER APPS MODE: ON ACTIVE WORKSPACE
            case AppsTrigger.ON_ACTIVE_WORKSPACE:
                if (!this._appWorkspaceChangedSignalId) {
                    this._appWorkspaceChangedSignalId =
                        global.workspace_manager.connect('workspace-switched',
                            this._appWorkspaceChanged.bind(this));
                }
                // Check if App is currently on active workspace
                this._appWorkspaceChanged();
                break;
            }
        }
    }

    _toggleWorkspace() {
        // Search for triggered apps on active workspace
        this._appConfigs.forEach((appId) => {
            let app = this._appSystem.lookup_app(appId);
            let isOnWorkspace = app.is_on_workspace(this._activeWorkspace);
            if (isOnWorkspace && !this._isToggleInhibited(appId)) {
                this._manageScreenBlankState(true); // Allow blank screen
                this._manageNightLight(false, true);
                this.addInhibit(appId); // Inhibit app
            } else if (!isOnWorkspace && this._isToggleInhibited(appId)) {
                this._manageScreenBlankState(true); // Allow blank screen
                this._manageNightLight(true, true);
                this.removeInhibit(appId); // Uninhibit app
            }
        });
    }

    _appWorkspaceChanged() {
        // Reset signal for Add/remove windows on workspace
        if (this._appAddWindowSignalId) {
            this._activeWorkspace.disconnect(this._appAddWindowSignalId);
            this._appAddWindowSignalId = null;
        }
        if (this._appRemoveWindowSignalId) {
            this._activeWorkspace.disconnect(this._appRemoveWindowSignalId);
            this._appRemoveWindowSignalId = null;
        }

        // Get active workspace
        this._activeWorkspace = global.workspace_manager.get_active_workspace();

        // Add signal listener on add/remove windows for the active workspace
        this._appAddWindowSignalId =
            this._activeWorkspace.connect('window-added', (wkspace, window) => {
                const type = window.get_window_type();
                // Accept only normal window, ignore all other type (dialog, menu,...)
                if (type === 0) {
                    // Add 100 ms delay to handle window detection
                    this._timeWorkspaceAdd = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        this._toggleWorkspace();
                        this._timeWorkspaceAdd = null;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        this._appRemoveWindowSignalId =
            this._activeWorkspace.connect('window-removed', (wkspace, window) => {
                const type = window.get_window_type();
                // Accept only normal window, ignore all other type (dialog, menu,...)
                if (type === 0) {
                    // Add 100 ms delay to handle window detection
                    this._timeWorkspaceRemove = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                        this._toggleWorkspace();
                        this._timeWorkspaceRemove = null;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });

        // Check and toggle Caffeine
        this._toggleWorkspace();
    }

    _appWindowFocusChanged() {
        let winTrack = Shell.WindowTracker.get_default();
        let appId = null;
        let app = winTrack.focus_app;

        if (app) {
            appId = app.get_id();
        }
        if (this._appConfigs.includes(appId) && !this._isToggleInhibited(appId)) {
            this._manageScreenBlankState(true); // Allow blank screen
            this._manageNightLight(false, true);
            this.addInhibit(appId); // Inhibit app

            // Uninhibit previous focused apps
            this._appInhibitedData.forEach((data, id) => {
                if (id !== appId && id !== 'user') {
                    this.removeInhibit(id);
                }
            });
        } else if (!this._appConfigs.includes(appId) && this._appInhibitedData.size !== 0) {
            this._manageScreenBlankState(true); // Allow blank screen
            this._manageNightLight(true, true);
            // Uninhibit all apps
            this._appInhibitedData.forEach((data, id) => {
                if (id !== 'user') {
                    this.removeInhibit(id);
                }
            });
        }
    }

    _appStateChanged(appSys, app) {
        let appId = app.get_id();
        let appState = app.get_state();

        if (this._appConfigs.includes(appId)) {
            // Block App state signal
            appSys.block_signal_handler(this._appStateChangedSignalId);

            // Allow blank screen
            this._manageScreenBlankState(true);

            if (appState === Shell.AppState.STOPPED && this._isToggleInhibited(appId)) {
                this._manageNightLight(true, true);
                this.removeInhibit(appId); // Uninhibit app
            } else if (appState !== Shell.AppState.STOPPED && !this._isToggleInhibited(appId)) {
                this._manageNightLight(false, true);
                this.addInhibit(appId); // Inhibit app
            }

            // Add 200 ms delay before unblock state signal
            this._timeAppUnblock = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                appSys.unblock_signal_handler(this._appStateChangedSignalId);
                this._timeAppUnblock = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    destroy() {
        // Remove all inhibitors
        this._appInhibitedData.forEach((data, appId) => this.removeInhibit(appId));
        this._appInhibitedData.clear();

        // Remove ToggleMenu
        this.quickSettingsItems.forEach((item) => item.destroy());

        // Disconnect from signals
        if (this._inhibitorAddedId) {
            this._sessionManager.disconnectSignal(this._inhibitorAddedId);
            this._inhibitorAddedId = null;
        }
        if (this._inhibitorRemovedId) {
            this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
            this._inhibitorRemovedId = null;
        }
        if (this._timeOut) {
            GLib.Source.remove(this._timeOut);
            this._timeOut = null;
        }
        if (this._timePrint) {
            GLib.Source.remove(this._timePrint);
            this._timePrint = null;
        }
        if (this._timeFullscreen) {
            GLib.Source.remove(this._timeFullscreen);
            this._timeFullscreen = null;
        }
        if (this._timeWorkspaceAdd) {
            GLib.Source.remove(this._timeWorkspaceAdd);
            this._timeWorkspaceAdd = null;
        }
        if (this._timeWorkspaceRemove) {
            GLib.Source.remove(this._timeWorkspaceRemove);
            this._timeWorkspaceRemove = null;
        }
        if (this._timeAppUnblock) {
            GLib.Source.remove(this._timeAppUnblock);
            this._timeAppUnblock = null;
        }
        this._resetAppSignalId();

        this._appConfigs.length = 0;
        this._settings = null;
        super.destroy();
    }
});

export default class CaffeineExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._caffeineIndicator = new Caffeine(this);

        // Register shortcut
        Main.wm.addKeybinding(TOGGLE_SHORTCUT, this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL, () => {
                this._caffeineIndicator.toggleState();
            });
    }

    disable() {
        this._caffeineIndicator.destroy();
        this._caffeineIndicator = null;

        // Unregister shortcut
        Main.wm.removeKeybinding(TOGGLE_SHORTCUT);
    }

    _openPreferences() {
        this.openPreferences();
    }
}


