/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
/* jshint multistr:true */
/* jshint esnext:true */
/* exported enable disable init */
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

const { Atk, Gtk, Gio, GObject, Shell, St, Meta, Clutter, GLib } = imports.gi;
const Config = imports.misc.config;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const QuickSettings = imports.ui.quickSettings;
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const ShellVersion = Number(Config.PACKAGE_VERSION.split('.')[0]);

const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const SHOW_TIMER_KEY= 'show-timer';
const DURATION_TIMER_INDEX= 'duration-timer';
const TOGGLE_STATE_KEY= 'toggle-state';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const NIGHT_LIGHT_KEY = 'nightlight-control';
const TOGGLE_SHORTCUT = 'toggle-shortcut';
const TIMER_KEY = 'countdown-timer';
const TIMER_ENABLED_KEY = 'countdown-timer-enabled';
const SCREEN_BLANK = 'screen-blank';
const TRIGGER_APPS_MODE = 'trigger-apps-mode';
const INDICATOR_POSITION = 'indicator-position';
const INDICATOR_INDEX = 'indicator-position-index';
const INDICATOR_POS_MAX = 'indicator-position-max';

const Gettext = imports.gettext.domain('gnome-shell-extension-caffeine');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

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

const IndicatorName = 'Caffeine';
const TimerMenuName = _('Caffeine timer');
const DisabledIcon = 'my-caffeine-off-symbolic';
const EnabledIcon = 'my-caffeine-on-symbolic';
const TimerMenuIcon = 'stopwatch-symbolic';

const ControlContext = {
    NEVER: 0,
    ALWAYS: 1,
    FOR_APPS: 2,
};

const ShowIndicator = {
    ONLY_ACTIVE: 0,
    ALWAYS: 1,
    NEVER: 2,
};

const AppsTrigger = {
    ON_RUNNING: 0,
    ON_FOCUS: 1,
    ON_ACTIVE_WORKSPACE: 2,
};

const TIMERS = [
    [5,10,15,20,30,'caffeine-short-timer-symbolic'],
    [10,20,30,40,50,'caffeine-medium-timer-symbolic'],
    [30,45,60,75,80,'caffeine-long-timer-symbolic'],
    [0,0,0,0,0,'caffeine-infinite-timer-symbolic'],
];

let CaffeineIndicator;
/*
* ------- Load custom icon -------
* hack (for Wayland?) via https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/1997
*
* For some reasons, I cannot use this instead:
*  'let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default())'
* see https://gjs.guide/extensions/upgrading/gnome-shell-40.html#custom-icon-theme
*  I get this error: "TypeError: Gtk.IconTheme.get_for_display is not a function"
*  This same line of code works on prefs.js... (Gnome 43)
*/
Gtk.IconTheme.get_default = function() {
    let theme = new Gtk.IconTheme();
    // gnome-shell switched away from GTK3 during the `44.rc` release. The Gtk.IconTheme method `set_custom_name`
    // has been renamed to `set_theme_name`. The below line allows support for all versions of GNOME 43 and 44+.
    if (theme.set_theme_name) {
        theme.set_theme_name(St.Settings.get().gtk_icon_theme);
    } else {
        theme.set_custom_theme(St.Settings.get().gtk_icon_theme);
    }
    return theme;
};

const CaffeineToggle = GObject.registerClass(
class CaffeineToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            // The 'label' property was renamed to 'title' in GNOME 44 but quick settings have otherwise 
            // not been changed. The below line allows support for both GNOME 43 and 44+ by using the 
            // appropriate property name based on the GNOME version.
            [ShellVersion >= 44 ? 'title' : 'label']: IndicatorName,
            toggleMode: true,
        });

        this._settings = ExtensionUtils.getSettings();

        // Icons
        this.finalTimerMenuIcon = TimerMenuIcon;
        if (!Gtk.IconTheme.get_default().has_icon(TimerMenuIcon)) {
            this.finalTimerMenuIcon =
                Gio.icon_new_for_string(`${Me.path}/icons/${TimerMenuIcon}.svg`);
        }
        this._iconActivated = Gio.icon_new_for_string(`${Me.path}/icons/${EnabledIcon}.svg`);;
        this._iconDeactivated = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);
        this._iconName();

        // Menu
        this.menu.setHeader(this.finalTimerMenuIcon, TimerMenuName, null);

        // Add elements
        this._itemsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._itemsSection);

        // Init Timers
        this._timerItems = new Map();
        this._syncTimers();
        this._sync();

        // Bind signals
        this._settings.bind(`${TOGGLE_STATE_KEY}`,
            this, 'checked',
            Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect(`changed::${TOGGLE_STATE_KEY}`, () => {
            this._iconName();
        });
        this._settings.connect(`changed::${TIMER_KEY}`, () => {
            this._sync();
        });
        this._settings.connect(`changed::${DURATION_TIMER_INDEX}`, () => {
            this._syncTimers();
        });
        this.connect('destroy', () => {
            this._iconActivated = null;
            this._iconDeactivated = null;
            this.gicon = null;
        });
    }

    _syncTimers() {
        this._itemsSection.removeAll();
        this._timerItems.clear();
        const durationIndex = this._settings.get_int(DURATION_TIMER_INDEX);

        for (const timer of TIMERS) {
            let label = null;
            if(timer[0] === 0) {
                label = _('Infinite');
            } else {
                label = parseInt(timer[durationIndex]) + 'm';
            }
            if (!label)
                continue;
            const icon = Gio.icon_new_for_string(`${Me.path}/icons/${timer[5]}.svg`);
            const item = new PopupMenu.PopupImageMenuItem(label, icon);
            item.connect('activate',() => (this._checkTimer(timer[durationIndex])));
            this._timerItems.set(timer[durationIndex], item);
            this._itemsSection.addMenuItem(item);
        }
        this.menuEnabled = TIMERS.length > 2;
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
        this._settings.set_boolean(TIMER_ENABLED_KEY, true);
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
    _init() {
        super._init();

        this._indicator = this._addIndicator();

        this._settings = ExtensionUtils.getSettings();

        // D-bus
        this._proxy = new ColorProxy(
            Gio.DBus.session,
            'org.gnome.SettingsDaemon.Color',
            '/org/gnome/SettingsDaemon/Color',
            (proxy, error) => {
                if (error)
                    log(error.message);
        });
        this._sessionManager = new DBusSessionManagerProxy(Gio.DBus.session,
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager');

        // From auto-move-windows@gnome-shell-extensions.gcampax.github.com
        this._appSystem = Shell.AppSystem.get_default();
        this._activeWorkspace = null;

        // Init Apps Signals Id
        this._appStateChangedSignalId = 0;
        this._appDisplayChangedSignalId = 0;
        this._appWorkspaceChangedSignalId = 0;
        this._appAddWindowSignalId = 0;
        this._appRemoveWindowSignalId = 0;

        // ("screen" in global) is false on 3.28, although global.screen exists
        if (typeof global.screen !== 'undefined') {
            this._screen = global.screen;
            this._display = this._screen.get_display();
        } else {
            this._screen = global.display;
            this._display = this._screen;
        }

        // Add indicator label for the timer
        this._timerLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._timerLabel.visible = false;
        this.add_child(this._timerLabel);

        // Icons
        this._iconActivated = Gio.icon_new_for_string(`${Me.path}/icons/${EnabledIcon}.svg`);;
        this._iconDeactivated = Gio.icon_new_for_string(`${Me.path}/icons/${DisabledIcon}.svg`);
        this._indicator.gicon = this._iconDeactivated;

        // Manage night light
        this._nightLight = false;

        /* Inhibited flag value
        * - 4: Inhibit suspending the session or computer
        * - 12: Inhibit the session being marked as idle
        */
        this.inhibitFlags= 12;

        // Caffeine state
        this._state = false;
        this._userState = false;

        // Store the inhibition requests until processed
        this._inhibitionAddedFifo=[];
        this._inhibitionRemovedFifo=[];

        // Init Timers
        this._timeOut = null;
        this._timePrint = null;
        this._timerEnable = false;
        this._timeFullscreen = null;
        this._timeWorkspaceAdd = null;
        this._timeWorkspaceRemove = null;
        this._timeAppUnblock = null;

        // Init settings keys and restore user state
        this._settings.reset(TIMER_ENABLED_KEY);
        this._settings.reset(TIMER_KEY);
        this._settings.reset(TOGGLE_STATE_KEY);
        if (this._settings.get_boolean(USER_ENABLED_KEY) && this._settings.get_boolean(RESTORE_KEY)) {
            this.toggleState();
        } else {
            // reset user state
            this._settings.reset(USER_ENABLED_KEY);
        }

        // Show icon
        this._manageShowIndicator();

        // Init app list
        this._appConfigs = [];
        this._appInhibitedData = new Map();
        this._updateAppConfigs();

        // Enable caffeine when fullscreen app is running
        if (this._settings.get_boolean(FULLSCREEN_KEY)) {
            this._inFullscreenId = this._screen.connect('in-fullscreen-changed', this.toggleFullscreen.bind(this));
            this.toggleFullscreen();
        }

        // QuickSettings
        this._caffeineToggle = new CaffeineToggle();
        this.quickSettingsItems.push(this._caffeineToggle);

        // Bind signals
        this._inhibitorAddedId = this._sessionManager.connectSignal(
            'InhibitorAdded', this._inhibitorAdded.bind(this));
        this._inhibitorRemovedId = this._sessionManager.connectSignal(
            'InhibitorRemoved', this._inhibitorRemoved.bind(this));
        this.inhibitId = this._settings.connect(`changed::${INHIBIT_APPS_KEY}`,
            this._updateAppConfigs.bind(this));
        this.stateId = this._settings.connect(`changed::${TOGGLE_STATE_KEY}`,
            this._updateMainState.bind(this));
        this.timerId = this._settings.connect(`changed::${TIMER_ENABLED_KEY}`,
            this._startTimer.bind(this));
        this.showTimerId = this._settings.connect(`changed::${SHOW_TIMER_KEY}`,
            this._showIndicatorLabel.bind(this));
        this.indicatorId = this._settings.connect(`changed::${INDICATOR_POSITION}`,
            this._updateIndicatorPosition.bind(this));
        this.showIndicatorId = this._settings.connect(`changed::${SHOW_INDICATOR_KEY}`, () => {
            this._manageShowIndicator();
            this._showIndicatorLabel();
        });
        this.triggerId = this._settings.connect(`changed::${TRIGGER_APPS_MODE}`, () => {
            this._resetAppSignalId();
            this._updateAppEventMode();
        });
        this.connect('destroy', () => {
            this.quickSettingsItems.forEach(item => item.destroy());
        });

        // Change user state on icon scroll event
        this._indicator.reactive = true;
        this._indicator.connect('scroll-event',
            (actor, event) => this._handleScrollEvent(event));

        // Init position and index of indicator icon
        this.indicatorPosition = this._settings.get_int(INDICATOR_POSITION);
        this.indicatorIndex = this._settings.get_int(INDICATOR_INDEX);
        this.lastIndicatorPosition = this.indicatorPosition;

        QuickSettingsMenu._indicators.insert_child_at_index(this,this.indicatorIndex);
        QuickSettingsMenu._addItems(this.quickSettingsItems);

        this._updateLastIndicatorPosition();
    }

    get inFullscreen() {
        let nbMonitors = this._screen.get_n_monitors();
        let inFullscreen = false;
        for (let i = 0; i < nbMonitors; i++) {
            if (this._screen.get_monitor_in_fullscreen(i)) {
                inFullscreen = true;
                break;
            }
        }
        return inFullscreen;
    }

    toggleFullscreen() {
        this._manageScreenBlankState(false);
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
            this._removeTimer(false);
            this._appInhibitedData.forEach((data, appId) =>
                this.removeInhibit(appId)
            );
            this._manageNightLight(true, false);
        } else {
            this.addInhibit('user');
            this._manageNightLight(false, false);
        }
    }

    addInhibit(appId) {
        this._sessionManager.InhibitRemote(appId,
            0, 'Inhibit by %s'.format(IndicatorName), this.inhibitFlags,
            cookie => {
                this._inhibitionAddedFifo.push(appId);
                // Init app data
                let data = {
                    cookie: cookie,
                    isToggled: true,
                    isInhibited: false,
                    object: '',
                };
                this._appInhibitedData.set(appId, data);
            }
        );
    }

    removeInhibit(appId) {
        let appData = this._appInhibitedData.get(appId);
        if(appData && appData.isInhibited){
            this._inhibitionRemovedFifo.push(appId);
            this._sessionManager.UninhibitRemote(appData.cookie);
            appData.isToggled = false;
            this._appInhibitedData.set(appId, appData);
        }
    }

    _updateLastIndicatorPosition() {
        let pos = -1;
        let nbItems = QuickSettingsMenu._indicators.get_n_children();
        let targetIndicator = null;

        // Count only the visible item in indicator bar
        for (let i = 0; i < nbItems; i++) {
            targetIndicator = QuickSettingsMenu._indicators.get_child_at_index(i);
            if (targetIndicator.is_visible()) {
                pos += 1;
            }
        }
        this._settings.set_int(INDICATOR_POS_MAX, pos);
    }

    _incrementIndicatorPosIndex() {
        if (this.lastIndicatorPosition < this.indicatorPosition) {
            this.indicatorIndex += 1;
        } else {
            this.indicatorIndex -= 1;
        }
    }

    _updateIndicatorPosition() {
        this._updateLastIndicatorPosition();
        const newPosition = this._settings.get_int(INDICATOR_POSITION);

        if (this.indicatorPosition != newPosition) {
            this.indicatorPosition = newPosition;
            this._incrementIndicatorPosIndex();

            // Skip invisible indicator
            let targetIndicator =
                QuickSettingsMenu._indicators.get_child_at_index(this.indicatorIndex);
            let maxIndex = QuickSettingsMenu._indicators.get_n_children();
            while (this.indicatorIndex < maxIndex && !targetIndicator.is_visible() && this.indicatorIndex > -1 ) {
                this._incrementIndicatorPosIndex();
                targetIndicator =
                    QuickSettingsMenu._indicators.get_child_at_index(this.indicatorIndex);
            }

            // Always reset index to 0 on position 0
            if (this.indicatorPosition == 0) {
                this.indicatorIndex = 0;
            }

            // Update last position
            this.lastIndicatorPosition = newPosition;

            // Update indicator index
            QuickSettingsMenu._indicators.remove_actor(this);
            QuickSettingsMenu._indicators.insert_child_at_index(this,this.indicatorIndex);
            this._settings.set_int(INDICATOR_INDEX, this.indicatorIndex);
        }
    }

    _showIndicatorLabel() {
        if(this._settings.get_boolean(SHOW_TIMER_KEY)
          && (this._settings.get_enum(SHOW_INDICATOR_KEY) !== ShowIndicator.NEVER)
          && this._timerEnable) {
            this._timerLabel.visible=true;
        } else {
            this._timerLabel.visible=false;
        }
    }

    _startTimer() {
        if(this._settings.get_boolean(TIMER_ENABLED_KEY)) {
            this._timerEnable = true;

            // Reset Timer
            this._removeTimer(true);

            // Enable Caffeine
            this._settings.set_boolean(TOGGLE_STATE_KEY, true);

            // Get duration
            let timerDelay = (this._settings.get_int(TIMER_KEY) * 60);

            // Execute Timer only if duration isn't set on infinite time
            if(timerDelay !== 0) {
                let secondLeft = timerDelay;
                this._showIndicatorLabel();
                this._printTimer(secondLeft);
                this._timePrint = GLib.timeout_add(GLib.PRIORITY_DEFAULT, (1000), () => {
                    secondLeft -= 1;
                    this._printTimer(secondLeft);
                    return GLib.SOURCE_CONTINUE;
                });

                this._timeOut = GLib.timeout_add(GLib.PRIORITY_DEFAULT, (timerDelay * 1000), () => {
                    // Disable Caffeine when timer ended
                    this._removeTimer(false);
                    this._settings.set_boolean(TOGGLE_STATE_KEY, false);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    _printTimer(second) {
        const min = Math.floor(second / 60);
        const minS = Math.floor(second % 60).toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
        });
        // Print Timer in system Indicator and Toggle menu subLabel
        this._updateLabelTimer(min + ':' + minS);
    }

    _removeTimer(reset) {
        if(!reset) {
            // Set duration back to 0
            this._settings.set_int(TIMER_KEY, 0);
            // End timer
            this._timerEnable = false;
        }
        this._settings.set_boolean(TIMER_ENABLED_KEY, false);
        this._updateLabelTimer(null);

        // Remove timer
        if((this._timeOut !== null) || (this._timePrint !== null)) {
            GLib.Source.remove(this._timeOut);
            GLib.Source.remove(this._timePrint);
            this._timeOut=null;
            this._timePrint=null;
        }
    }

    _updateLabelTimer(text) {
        this._timerLabel.text = text;
        this._caffeineToggle.menu.setHeader(this._caffeineToggle.finalTimerMenuIcon, TimerMenuName, text);
        if (ShellVersion >= 44) {
            this._caffeineToggle.subtitle = text;    
        }   
    }

    _handleScrollEvent(event) {
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                if(!this._state) {
                    // User state on - UP
                    this._settings.set_boolean(TOGGLE_STATE_KEY, true);
                }
                break;
            case Clutter.ScrollDirection.DOWN:
                if(this._state) {
                    // Stop timer
                    this._removeTimer(false);
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
                inhibitor.GetAppIdRemote(appId => {
                    appId = String(appId);
                    let appData = this._appInhibitedData.get(appId);
                    if (appId !== '' && requestedId === appId && appData) {
                        if (appId === 'user') {
                            this._saveUserState(true);
                        }
                        appData.isInhibited = true;
                        appData.object = object;
                        this._appInhibitedData.set(appId, appData);

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

    _inhibitorRemoved(proxy, sender, [object]) {
        // Get the first removed request
        let appId = this._inhibitionRemovedFifo.shift();

        if(appId){
            let appData = this._appInhibitedData.get(appId);
            if (appData){
                if (appId === 'user') {
                       this._saveUserState(false);
                }
                // Remove app from list
                this._appInhibitedData.delete(appId);

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

    _updateAppConfigs() {
        this._appConfigs.length = 0;
        this._settings.get_strv(INHIBIT_APPS_KEY).forEach(appId => {
            // Check if app still exist
            const appInfo = Gio.DesktopAppInfo.new(appId);
            if (appInfo) {
                this._appConfigs.push(appId);
            }
        });

        // Remove inhibited app that are not in the list anymore
        let inhibitedAppsToRemove = [...this._appInhibitedData.keys()]
            .filter(id => !this._appConfigs.includes(id));
        inhibitedAppsToRemove.forEach(id => {
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
    }

    _saveUserState(state) {
        this._userState = state;
        this._settings.set_boolean(USER_ENABLED_KEY, state);
    }

    _saveMainState(state) {
        this._state = state;
        this._settings.set_boolean(TOGGLE_STATE_KEY, state);
    }

    _resetAppSignalId(){
        if (this._appStateChangedSignalId > 0) {
            this._appSystem.disconnect(this._appStateChangedSignalId);
            this._appStateChangedSignalId = 0;
        }
        if (this._appDisplayChangedSignalId > 0) {
            global.display.disconnect(this._appDisplayChangedSignalId);
            this._appDisplayChangedSignalId = 0;
        }
        if (this._appWorkspaceChangedSignalId > 0) {
            global.workspace_manager.disconnect(this._appWorkspaceChangedSignalId);
            this._appWorkspaceChangedSignalId = 0;
        }
        if (this._appAddWindowSignalId > 0) {
            this._activeWorkspace.disconnect(this._appAddWindowSignalId);
            this._appAddWindowSignalId = 0;
        }
        if (this._appRemoveWindowSignalId > 0) {
            this._activeWorkspace.disconnect(this._appRemoveWindowSignalId);
            this._appRemoveWindowSignalId = 0;
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
                    if(this._appStateChangedSignalId === 0){
                        this._appStateChangedSignalId =
                            this._appSystem.connect('app-state-changed',
                                this._appStateChanged.bind(this));
                    }
                    // Check if currently running App
                    this._appConfigs.forEach( id => {
                        let app = this._appSystem.lookup_app(id);
                        if(app && app.get_state() !== Shell.AppState.STOPPED) {
                            this._appStateChanged(this._appSystem, app);
                        }
                    });
                    break;
                // TRIGGER APPS MODE: ON FOCUS
                case AppsTrigger.ON_FOCUS:
                    if(this._appDisplayChangedSignalId === 0){
                        this._appDisplayChangedSignalId =
                            global.display.connect('notify::focus-window',
                                this._appWindowFocusChanged.bind(this));
                    }
                    // Check if currently focused App
                    this._appWindowFocusChanged();
                    break;
                // TRIGGER APPS MODE: ON ACTIVE WORKSPACE
                case AppsTrigger.ON_ACTIVE_WORKSPACE:
                    if(this._appWorkspaceChangedSignalId === 0){
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
        this._appConfigs.forEach( appId => {
            let app = this._appSystem.lookup_app(appId);
            let isOnWorkspace = app.is_on_workspace(this._activeWorkspace);
            if(isOnWorkspace && !this._isToggleInhibited(appId)){
                this._manageScreenBlankState(true); // Allow blank screen
                this._manageNightLight(false, true);
                this.addInhibit(appId); // Inhibit app
            } else if(!isOnWorkspace && this._isToggleInhibited(appId)){
                this._manageScreenBlankState(true); // Allow blank screen
                this._manageNightLight(true, true);
                this.removeInhibit(appId); // Uninhibit app
            }
        });
    }

    _appWorkspaceChanged() {
        // Reset signal for Add/remove windows on workspace
        if (this._appAddWindowSignalId > 0) {
            this._activeWorkspace.disconnect(this._appAddWindowSignalId);
            this._appAddWindowSignalId = 0;
        }
        if (this._appRemoveWindowSignalId > 0) {
            this._activeWorkspace.disconnect(this._appRemoveWindowSignalId);
            this._appRemoveWindowSignalId = 0;
        }

        // Get active workspace
        this._activeWorkspace = global.workspace_manager.get_active_workspace();

        // Add signal listener on add/remove windows for the active workspace
        this._appAddWindowSignalId =
            this._activeWorkspace.connect('window-added', (wkspace, window) => {
            const type = window.get_window_type();
            // Accept only normal window, ignore all other type (dialog, menu,...)
            if(type === 0) {
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
            if(type === 0) {
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

        if(app) {
            appId = app.get_id();
        }
        if(this._appConfigs.includes(appId) && !this._isToggleInhibited(appId)){
            this._manageScreenBlankState(true); // Allow blank screen
            this._manageNightLight(false, true);
            this.addInhibit(appId); // Inhibit app
        } else if (!this._appConfigs.includes(appId) && this._appInhibitedData.size !== 0){
            this._manageScreenBlankState(true); // Allow blank screen
            this._manageNightLight(true, true);
            // Uninhibit all apps
            this._appInhibitedData.forEach((data, id) => {
                this.removeInhibit(id);
            });
        }
    }

    _appStateChanged(appSys, app) {
        let appId = app.get_id();
        let appState = app.get_state();

        if(this._appConfigs.includes(appId)){
            // Block App state signal
            appSys.block_signal_handler(this._appStateChangedSignalId);

            // Allow blank screen
            this._manageScreenBlankState(true);

            if (appState === Shell.AppState.STOPPED && this._isToggleInhibited(appId)){
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

        // Disconnect from signals
        if (this._settings.get_boolean(FULLSCREEN_KEY)) {
            this._screen.disconnect(this._inFullscreenId);
        }
        if (this._inhibitorAddedId) {
            this._sessionManager.disconnectSignal(this._inhibitorAddedId);
            this._inhibitorAddedId = 0;
        }
        if (this._inhibitorRemovedId) {
            this._sessionManager.disconnectSignal(this._inhibitorRemovedId);
            this._inhibitorRemovedId = 0;
        }
        if (this._windowCreatedId) {
            this._display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
        if (this._windowDestroyedId) {
            global.window_manager.disconnect(this._windowDestroyedId);
            this._windowDestroyedId = 0;
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

        // Disconnect settings signals
        if (this.inhibitId) {
            this._settings.disconnect(this.inhibitId);
            this.inhibitId = undefined;
        }
        if (this.stateId) {
            this._settings.disconnect(this.stateId);
            this.stateId = undefined;
        }
        if (this.timerId) {
            this._settings.disconnect(this.timerId);
            this.timerId = undefined;
        }
        if (this.showTimerId) {
            this._settings.disconnect(this.showTimerId);
            this.showTimerId = undefined;
        }
        if (this.indicatorId) {
            this._settings.disconnect(this.indicatorId);
            this.indicatorId = undefined;
        }
        if (this.showIndicatorId) {
            this._settings.disconnect(this.showIndicatorId);
            this.showIndicatorId = undefined;
        }
        if (this.triggerId) {
            this._settings.disconnect(this.triggerId);
            this.triggerId = undefined;
        }

        this._appConfigs.length = 0;
        this._settings = null;
        super.destroy();
    }
});

/**
 * Steps to run on initialization of the extension
 */
function init() {
    ExtensionUtils.initTranslations();
}

/**
 * Steps to run when the extension is enabled
 */
function enable() {

    const _settings = ExtensionUtils.getSettings();

    CaffeineIndicator = new Caffeine();

    // Register shortcut
    Main.wm.addKeybinding(TOGGLE_SHORTCUT, _settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.ALL, () => {
        CaffeineIndicator.toggleState();
    });
}

/**
 * Steps to run when the extension is disabled
 */
function disable() {
    CaffeineIndicator.destroy();
    CaffeineIndicator = null;

    // Unregister shortcut
    Main.wm.removeKeybinding(TOGGLE_SHORTCUT);
}
