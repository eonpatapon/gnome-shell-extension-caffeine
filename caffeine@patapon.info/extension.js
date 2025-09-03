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
import { MprisPlayer } from './mprisMediaPlayer2.js';
import { PopupAnimation } from 'resource:///org/gnome/shell/ui/boxpointer.js';

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
const SHOW_TOGGLE_KEY = 'show-toggle';
const DURATION_TIMER_LIST = 'duration-timer-list';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const MPRIS_KEY = 'enable-mpris';
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
  </interface>\
</node>';

const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

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

const InhibitorManager = GObject.registerClass({
    Signals: {
        'update': {}
    }
}, class InhibitorManager extends GObject.Object {
    _init(settings) {
        super._init();

        this._isInhibited = false;
        this._inhibitorCookie = null;
        this._userEnabled = false;
        this._triggerApp = null;
        this._tempManageLight = false;
        this._lastReasons = [];
        this._ignoredReasons = [];

        // App trigger signal IDs
        this._appStateSignal = null;
        this._focusWindowSignal = null;
        this._workspaceSignal = null;
        this._restackedSignal = null;

        // DBus proxies
        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager');
        this._colorProxy = new ColorProxy(
            Gio.DBus.session,
            'org.gnome.SettingsDaemon.Color',
            '/org/gnome/SettingsDaemon/Color',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                }
            }
        );

        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();

        // Update state when extension settings changed
        this._settings.connectObject(
            `changed::${SCREEN_BLANK}`,
            () => this._forceUpdate(),
            `changed::${FULLSCREEN_KEY}`,
            () => this._updateState(),
            `changed::${MPRIS_KEY}`,
            () => this._onMprisSettingChange(),
            `changed::${NIGHT_LIGHT_KEY}`,
            () => this._updateState(),
            `changed::${INHIBIT_APPS_KEY}`,
            () => this._updateState(),
            `changed::${TRIGGER_APPS_MODE}`,
            () => {
                this._disconnectTriggerSignals();
                this._connectTriggerSignals();
                this._updateState();
            }, this);

        // Update state when fullscreened
        global.display.connectObject('in-fullscreen-changed', () => this._updateState(), this);

        // Init mpris
        this._onMprisSettingChange();

        // Update when possible app triggers change
        this._connectTriggerSignals();

        this._updateState();
    }

    _onMprisSettingChange() {
        const enable = this._settings.get_boolean(MPRIS_KEY);
        if (enable && !MprisPlayer.isActive) {
            MprisPlayer.Get().connectIsPlaying((_isPlaying) => this._updateState());
        } else {
            MprisPlayer.Destroy();
        }
        this._updateState();
    }

    _connectTriggerSignals() {
        // Only connect to relevant signals for the selected trigger
        switch (this._settings.get_enum(TRIGGER_APPS_MODE)) {
        case AppsTrigger.ON_RUNNING:
            this._appStateSignal = this._appSystem.connect('app-state-changed',
                () => this._updateState());
            break;
        case AppsTrigger.ON_FOCUS:
            this._focusWindowSignal = global.display.connect('notify::focus-window',
                () => this._updateState());
            break;
        case AppsTrigger.ON_ACTIVE_WORKSPACE:
            this._appStateSignal = this._appSystem.connect('app-state-changed',
                () => this._updateState());
            this._workspaceSignal = global.workspace_manager.connect('workspace-switched',
                () => this._updateState());
            this._restackedSignal = global.display.connect('restacked',
                () => this._updateState());
            break;
        }
    }

    _disconnectTriggerSignals() {
        if (this._appStateSignal !== null) {
            this._appSystem.disconnect(this._appStateSignal);
            this._appStateSignal = null;
        }
        if (this._focusWindowSignal !== null) {
            global.display.disconnect(this._focusWindowSignal);
            this._focusWindowSignal = null;
        }
        if (this._workspaceSignal !== null) {
            global.workspace_manager.disconnect(this._workspaceSignal);
            this._workspaceSignal = null;
        }
        if (this._restackedSignal !== null) {
            global.display.disconnect(this._restackedSignal);
            this._restackedSignal = null;
        }
    }

    _findRunningApp() {
        let possibleTriggerApps = this._settings.get_strv(INHIBIT_APPS_KEY);
        let runningApps = this._appSystem.get_running();

        for (let app of runningApps) {
            let appId = app.get_id();
            if (possibleTriggerApps.includes(appId)) {
                return appId;
            }
        }

        return null;
    }

    _findFocusedApp() {
        let possibleTriggerApps = this._settings.get_strv(INHIBIT_APPS_KEY);
        let focusedApp = Shell.WindowTracker.get_default().focus_app;
        if (focusedApp !== null) {
            let appId = focusedApp.get_id();
            if (possibleTriggerApps.includes(appId)) {
                return appId;
            }
        }

        return null;
    }

    _findActiveApp() {
        let possibleTriggerApps = this._settings.get_strv(INHIBIT_APPS_KEY);
        let activeWorkspace = global.workspace_manager.get_active_workspace();

        for (let appId of possibleTriggerApps) {
            let app = this._appSystem.lookup_app(appId);
            if (app !== null) {
                if (app.is_on_workspace(activeWorkspace)) {
                    return appId;
                }
            }
        }

        return null;
    }

    _getInhibitReasons() {
        let reasons = [];
        if (this.isFullscreen() && this._settings.get_boolean(FULLSCREEN_KEY)) {
            reasons.push('fullscreen');
        }

        if (MprisPlayer.isActive && MprisPlayer.Get().isPlaying) {
            reasons.push('mpris');
        }

        if (this._userEnabled) {
            reasons.push('user');
        }

        // Find any selected apps that meet the trigger
        let triggerApp = null;
        if (this._settings.get_strv(INHIBIT_APPS_KEY).length !== 0) {
            switch (this._settings.get_enum(TRIGGER_APPS_MODE)) {
            case AppsTrigger.ON_RUNNING:
                triggerApp = this._findRunningApp();
                break;
            case AppsTrigger.ON_FOCUS:
                triggerApp = this._findFocusedApp();
                break;
            case AppsTrigger.ON_ACTIVE_WORKSPACE:
                triggerApp = this._findActiveApp();
                break;
            }
        }

        // Save any responsible app and update reasons
        this._triggerApp = triggerApp;
        if (triggerApp !== null) {
            reasons.push('app');
        }

        return reasons;
    }

    _forceUpdate() {
        // Remove any inhibitor, as settings / inhibit flags may have changed
        if (this._isInhibited) {
            this._removeInhibitor();
        }

        // Update state, as normal
        this._updateState();
    }

    _updateState() {
        // Get the reasons for inhibiting
        let reasons = this._getInhibitReasons();

        // If any ignored reasons are no longer active, stop ignoring them
        this._ignoredReasons = this._ignoredReasons.filter(Set.prototype.has, new Set(reasons));

        // Ignore any reasons in the ignore list, then save them
        reasons = reasons.filter((n) => !this._ignoredReasons.includes(n));
        this._lastReasons = [...reasons];
        let shouldInhibit = reasons.length !== 0;

        /* If no trigger app is running, and the light is in app-only mode,
           and we left it blocked, unblock it
        */
        if (!reasons.includes('app')) {
            if (this._settings.get_enum(NIGHT_LIGHT_KEY) === ControlContext.FOR_APPS) {
                if (this._colorProxy.DisabledUntilTomorrow === true) {
                    this._tempManageLight = true;
                }
            }
        }

        // Update inhibitor if required
        if (this._isInhibited !== shouldInhibit) {
            if (shouldInhibit) {
                this._addInhibitor(reasons);
            } else {
                this._removeInhibitor();
            }
        }

        // Update night light if required
        if (this.isNightLightManaged()) {
            // If this._tempManageLight is true we're actually disabling
            if (shouldInhibit && !this._tempManageLight) {
                // Block night light
                this._colorProxy.DisabledUntilTomorrow = true;
            } else {
                // Allow night light
                this._colorProxy.DisabledUntilTomorrow = false;
            }
        }

        // Let indicator know that either the state or reasons may have changed
        this.emit('update');

        // Remove any night light management override now the signal is done
        this._tempManageLight = false;
    }

    _addInhibitor(reasons) {
        // Decide whether to allow screen blanking
        let allowBlank = this._settings.get_enum(SCREEN_BLANK) === ControlContext.ALWAYS;
        if (reasons.includes('app')) {
            allowBlank = this._settings.get_enum(SCREEN_BLANK) > ControlContext.NEVER;
        }

        let inhibitFlags;
        if (allowBlank) {
            // Inhibit suspending the session or computer
            inhibitFlags = 4;
        } else {
            // Inhibit the session being marked as idle
            inhibitFlags = 8;
        }

        // Pack the parameters for DBus
        let params = [
            GLib.Variant.new_string('caffeine-gnome-extension'),
            GLib.Variant.new_uint32(0),
            GLib.Variant.new_string('Inhibit by %s'.format(this._name)),
            GLib.Variant.new_uint32(inhibitFlags)
        ];
        let paramsVariant = GLib.Variant.new_tuple(params);

        // Synchronously add the inhibitor
        let cookieTuple = this._sessionManager.call_sync('Inhibit', paramsVariant,
            Gio.DBusCallFlags.NONE, -1, null);
        if (cookieTuple !== null) {
            this._inhibitorCookie = cookieTuple.get_child_value(0).get_uint32();
            this._isInhibited = true;
        } else {
            log('Failed to add inhibitor');
        }
    }

    _removeInhibitor() {
        // Remove the inhibitor if it's active
        if (this._isInhibited) {
            // Use the cookie to remove the inhibitor
            this._sessionManager.UninhibitRemote(this._inhibitorCookie);
            this._inhibitorCookie = null;
            this._isInhibited = false;
        }
    }

    isFullscreen() {
        let monitorCount = global.display.get_n_monitors();
        for (let i = 0; i < monitorCount; i++) {
            if (global.display.get_monitor_in_fullscreen(i)) {
                return true;
            }
        }

        return false;
    }

    isNightLightManaged() {
        // Don't bother checking settings if it's overridden
        if (this._tempManageLight) {
            return true;
        }

        // Decide if we should control the night light from user preference
        let handleNightLight = this._settings.get_enum(NIGHT_LIGHT_KEY) === ControlContext.ALWAYS;
        if (this._lastReasons.includes('app')) {
            handleNightLight = this._settings.get_enum(NIGHT_LIGHT_KEY) > ControlContext.NEVER;
        }

        return handleNightLight;
    }

    getInhibitState() {
        return this._isInhibited;
    }

    getInhibitApp() {
        return this._triggerApp;
    }

    setUserEnabled(enabled) {
        this._userEnabled = enabled;
        if (!enabled) {
            this._ignoredReasons = this._getInhibitReasons();
        }

        this._updateState();
    }

    destroy() {
        this._disconnectTriggerSignals();
        global.display.disconnectObject(this);
        this._settings.disconnectObject(this);

        if (this._isInhibited) {
            this._removeInhibitor();
        }
    }
});

const CaffeineToggle = GObject.registerClass({
    Signals: {
        'timer-clicked': {}
    }
}, class CaffeineToggle extends QuickSettings.QuickMenuToggle {
    _init(Me) {
        super._init({
            'title': _('Caffeine'),
            toggleMode: false
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
        this.updateIcon();

        // Set up entry
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
        this._settings.connectObject(
            `changed::${TIMER_KEY}`,
            () => this._sync(),
            `changed::${DURATION_TIMER_LIST}`,
            () => this._syncTimers(true),
            `changed::${SHOW_TOGGLE_KEY}`,
            () => {
                this.visible = this._settings.get_boolean(SHOW_TOGGLE_KEY);
            },
            this);
        this.connect('destroy', () => {
            this._iconActivated = null;
            this._iconDeactivated = null;
            this.gicon = null;
        });

        // Set menu visibility
        this.visible = this._settings.get_boolean(SHOW_TOGGLE_KEY);
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
        this.emit('timer-clicked');
    }

    updateIcon() {
        if (this.checked) {
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

        this._appSystem = Shell.AppSystem.get_default();
        this._indicator = this._addIndicator();
        this._settings = Me._settings;
        this._name = Me.metadata.name;
        this._state = false;

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

        // Init Timers
        this._timeOut = null;
        this._timePrint = null;
        this._timerEnable = false;

        // Show icon
        this._manageShowIndicator();

        // Quick Settings
        this._caffeineToggle = new CaffeineToggle(Me);

        this.quickSettingsItems.push(this._caffeineToggle);
        this._updateTimerSubtitle();

        this._caffeineToggle.connectObject('clicked', () => this._handleToggleClick(), this);
        this._caffeineToggle.connectObject('timer-clicked', () => this._forceToggleClick(), this);

        // Bind settings signals
        this._settings.connectObject(
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

        // Setup inhibitor manager
        this._inhibitorManager = new InhibitorManager(this._settings);
        this._inhibitorManager.connectObject('update', () => this._inhibitorUpdated(), this);

        // Set manager user state and restore user state, if required
        if (this._settings.get_boolean(USER_ENABLED_KEY) &&
            this._settings.get_boolean(RESTORE_KEY)) {
            // Restore Caffeine as enabled (fake a user click)
            this._forceToggleClick();
        }
    }

    _forceToggleClick() {
        this._state = false;
        this._handleToggleClick();
    }

    _handleToggleClick() {
        // Pass the new user state to the inhibitor manager, causes state to invert
        this._inhibitorManager.setUserEnabled(!this._state);
        this._settings.set_boolean(USER_ENABLED_KEY, this._state);

        if (this._state) {
            // Enable timer when toggled on and duration is set
            if (this._settings.get_int(TIMER_KEY) !== 0 && !this._timerEnable) {
                this._startTimer();
            }
        } else {
            // Enable timer when toggled off
            this._removeTimer();
        }

        this._updateTimerSubtitle();
        this._updateMaxPosition();
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
            while (this.indicatorIndex < maxIndex && !targetIndicator.is_visible() &&
                   this.indicatorIndex > -1) {
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
                if (this._state) {
                    this._handleToggleClick();
                }
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
        this._caffeineToggle.menu.setHeader(this._caffeineToggle.finalTimerMenuIcon,
            _('Caffeine Timer'), text);
        this._caffeineToggle.subtitle = text;
    }

    _handleScrollEvent(event) {
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            if (!this._state) {
                // User state on - UP
                this._handleToggleClick();
            }
            break;
        case Clutter.ScrollDirection.DOWN:
            if (this._state) {
                // Stop timer
                this._removeTimer();
                // User state off - DOWN
                this._handleToggleClick();
            }
            break;
        }
    }

    _inhibitorUpdated() {
        // Update the tracked state
        let oldState = this._state;
        this._state = this._inhibitorManager.getInhibitState();

        // Update the visual state and subtitle
        this._caffeineToggle.checked = this._state;
        this._caffeineToggle.updateIcon();
        this._updateAppSubtitle(this._inhibitorManager.getInhibitApp());

        // Send an OSD notification, if enabled and state changed
        if (this._state !== oldState) {
            if (this._settings.get_boolean(SHOW_NOTIFICATIONS_KEY) &&
                !this._inhibitorManager.isFullscreen()) {
                this._sendOSDNotification(this._state);
            }
        }

        // Update indicator, icon and subtitle
        this._manageShowIndicator();
        this._updateTimerSubtitle();
    }

    _manageShowIndicator() {
        if (this._state) {
            this._indicator.visible = this._settings.get_enum(SHOW_INDICATOR_KEY) !== ShowIndicator.NEVER;
            this._indicator.gicon = this._iconActivated;
        } else {
            this._indicator.visible = this._settings.get_enum(SHOW_INDICATOR_KEY) === ShowIndicator.ALWAYS;
            this._indicator.gicon = this._iconDeactivated;
        }
    }

    _sendOSDNotification(state) {
        let message = _('Caffeine enabled');
        let icon = this._iconActivated;
        if (!state) {
            message = _('Caffeine disabled');
            icon = this._iconDeactivated;
        }

        if (this._inhibitorManager.isNightLightManaged()) {
            if (state) {
                message = message + '. ' + _('Night Light paused');
            } else {
                message = message + '. ' + _('Night Light resumed');
            }
        }

        if (ShellVersion >= 49) {
            Main.osdWindowManager.showAll(icon, message, null, null);
        } else {
            Main.osdWindowManager.show(-1, icon, message, null, null);
        }
    }

    // Add the name of the app as subtitle
    _updateAppSubtitle(appId) {
        if (appId === null) {
            this._caffeineToggle.subtitle = null;
            return;
        }

        let app = this._appSystem.lookup_app(appId);
        if (app === null) {
            this._caffeineToggle.subtitle = null;
            return;
        }

        this._caffeineToggle.subtitle = app.get_name();
    }

    // Add the timer duration selected as subtitle
    _updateTimerSubtitle() {
        if (!this._state) {
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

    destroy() {
        // Remove ToggleMenu
        this.quickSettingsItems.forEach((item) => item.destroy());

        // Disconnect from signals
        if (this._timeOut) {
            GLib.Source.remove(this._timeOut);
            this._timeOut = null;
        }
        if (this._timePrint) {
            GLib.Source.remove(this._timePrint);
            this._timePrint = null;
        }

        MprisPlayer.Destroy();
        this._inhibitorManager.destroy();
        this._inhibitorManager = null;

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
                this._caffeineIndicator._handleToggleClick();
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
        QuickSettingsMenu.menu.close(PopupAnimation.FADE);
    }
}
