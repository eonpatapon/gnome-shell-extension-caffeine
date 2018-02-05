
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;
const Shell = imports.gi.Shell;
const MessageTray = imports.ui.messageTray;
const Atk = imports.gi.Atk;
const Config = imports.misc.config;


const INHIBIT_APPS_KEY = 'inhibit-apps';
const SHOW_INDICATOR_KEY = 'show-indicator';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const USER_ENABLED_KEY = 'user-enabled';
const RESTORE_KEY = 'restore-state';
const FULLSCREEN_KEY = 'enable-fullscreen';
const ADDRESS_INHIBITOR_KEY = 'address-inhibitor';

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
    <method name="IsInhibited">\
	    <arg type="u" direction="in" />\
    	<arg type="b" direction="out" />\
	</method>\
	<method name="GetInhibitors">\
	    <arg type="ao" direction="out" />\
	</method>\
    <signal name="InhibitorAdded">\
        <arg type="o" direction="out" />\
    </signal>\
    <signal name="InhibitorRemoved">\
	    <arg type="o" />\
	</signal>\
  </interface>\
</node>';
const DBusSessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerIface);

const DBusSessionManagerInhibitorIface = '<node>\
  <interface name="org.gnome.SessionManager.Inhibitor">\
    <method name="GetFlags">\
	    <arg type="u" direction="out" />\
	</method>\
    <method name="GetAppId">\
	    <arg type="s" direction="out" />\
	</method>\
  </interface>\
</node>';
const DBusSessionManagerInhibitorProxy = Gio.DBusProxy.makeProxyWrapper(DBusSessionManagerInhibitorIface);

const enableSuspendIcon = {'app': 'my-caffeine-off-symbolic', 'user': 'my-caffeine-off-symbolic-user'};
const disableSuspendIcon = {'app': 'my-caffeine-on-symbolic', 'user': 'my-caffeine-on-symbolic-user'};

//below are default inhibit flags
const INHIBIT_LOGOUT = 1; // logging out
const INHIBIT_SWITCH = 2; // switching user
const INHIBIT_SUSPEND = 4; // well, weird value, seems got it while playing audio stream only
const INHIBIT_IDLE = 8; // playing, for fullscreen: 4 + 8
const INHIBIT_AUTO_MOUNT = 16; // auto-mouting media

const MASK_SUSPEND_DISABLE_INHIBIT = INHIBIT_IDLE | INHIBIT_AUTO_MOUNT;
const MASK_SUSPEND_ENABLE_INHIBIT =  INHIBIT_LOGOUT | INHIBIT_SWITCH;

let self;
let sessionManager;
let signalInhibitorAddedId;
let signalInhibitorRemovedId;
let hasInhibitors = false;
let inhibitors = [];
function init(ext) {
	self = ext;

	sessionManager = new DBusSessionManagerProxy(Gio.DBus.session, 'org.gnome.SessionManager', '/org/gnome/SessionManager');
    
	signalInhibitorAddedId = sessionManager.connectSignal('InhibitorAdded', Lang.bind(self, added));
	signalInhibitorRemovedId = sessionManager.connectSignal('InhibitorRemoved', Lang.bind(self, removed));
	check();
	checkSysInhibitors();
}

function checkSysInhibitors() {
	sessionManager.GetInhibitorsRemote(Lang.bind(self, function([sys_inhibitors]){ // call it for ensure getting updated InhibitedActions
    	for (let i in sys_inhibitors) {
    		if (inhibitors.indexOf(sys_inhibitors[i]) != -1) continue;
    		let inhibitor = makeProxy(sys_inhibitors[i]);
    		inhibitor.GetFlagsRemote(Lang.bind(self, function(flags){
    			if (!(flags & MASK_SUSPEND_DISABLE_INHIBIT)) return;
    			inhibitor.GetAppIdRemote(Lang.bind(self, function([app_id]){
    				let needInsert = true;
    				for (var index in inhibitors) {
    		    		if (inhibitors[index]["app_id"] == app_id) {
    		    			needInsert = false;
    		    			inhibitors[index]["object"] = object;
    		    		}
    		    	}
    				if (needInsert){
    			    	let item = {"app_id": app_id, "object": sys_inhibitors[i]};
    			    	inhibitors.push(item);
    				}
    			}));
    		}));
    	}
	}));
}

function list() {
	return inhibitors;
}

function add(app_id, reason, pid) {
	if (get(app_id)) return;
	if (pid == undefined) pid = 0;
	
	let inhibitor = {"app_id": app_id, "pid": pid, "reason": reason};
	inhibitors.push(inhibitor);
	sessionManager.InhibitRemote(app_id, pid, reason, INHIBIT_SUSPEND | INHIBIT_IDLE, Lang.bind(self, function(cookie) {
		saveCookie(app_id, cookie);
    }));
}

function added(proxy, sender, [object]) {
	sessionManager.IsInhibitedRemote(MASK_SUSPEND_DISABLE_INHIBIT, Lang.bind(self, function(is_inhibited){ // call it for ensure getting updated InhibitedActions
		if (!is_inhibited) return;
		
		check();
		
		let inhibitor = makeProxy(object);
		inhibitor.GetAppIdRemote(Lang.bind(self, function([app_id]){
			let needInsert = true;
			for (var index in inhibitors) {
	    		if (inhibitors[index]["app_id"] == app_id) {
	    			needInsert = false;
	    			inhibitors[index]["object"] = object;
	    		}
	    	}
			if (needInsert){
		    	let item = {"app_id": app_id, "object": object};
		    	inhibitors.push(item);
			}
		}));
	}));
}

function remove(app_id) {
	let inhibitor = get(app_id);
	if (!inhibitor) return;

	let cookie_remove = inhibitor["value"]["cookie"];
	inhibitors.splice(inhibitor["index"], 1); 
	sessionManager.UninhibitRemote(cookie_remove);
}

function removed(proxy, sender, [object]) {
	let inhibitor = get(object, "object");
	if (inhibitor) inhibitors.splice(inhibitor["index"], 1); 
	check();
}

function check() {
	sessionManager.IsInhibitedRemote(MASK_SUSPEND_DISABLE_INHIBIT, Lang.bind(self, function([is_inhibited]) {
		hasInhibitors = is_inhibited;
		toggleIcon();
    }));
}

function isInhibited() {
	return hasInhibitors;
}

function saveCookie(app_id, cookie) {
	for (var index in inhibitors) {
		if (inhibitors[index]["app_id"] != app_id) continue;
		inhibitors[index]["cookie"] = cookie;
	}
}

function makeProxy(path) {
	return new DBusSessionManagerInhibitorProxy(Gio.DBus.session, 'org.gnome.SessionManager', path);
}

//query_type default is "app_id"
function get(val, query_type) {
	if (query_type == undefined || query_type == "") query_type = "app_id";
	for (var index in inhibitors) {
		if (inhibitors[index][query_type] != val) continue;
		
		return {"index": index, "value": inhibitors[index]};
	}
	
	return false;
}

function toggleIcon() {
	if (isInhibited()) { // auto suspend keeping disabled
		let icon_name = disableSuspendIcon['app'];
		if (self._settings.get_boolean(USER_ENABLED_KEY))
			icon_name = disableSuspendIcon['user'];
		
		self._icon.icon_name = icon_name;
		return;
	}
	self._icon.icon_name = enableSuspendIcon['app'];
}





