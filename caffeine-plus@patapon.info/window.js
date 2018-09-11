const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Shell = imports.gi.Shell;


const INHIBIT_APPS_KEY = 'inhibit-apps';
const FULLSCREEN_KEY = 'enable-fullscreen';
const ADDRESS_INHIBITOR_KEY = 'address-inhibitor';

let self;
let windows = [];
let ReasonFullScreen;
let ReasonUserApps;
let signalWindowCreatedId;
let signalWindowDestroyedId;
let signalInFullscreenId;
let mainloopFullScreenId;
let mainloopWindowId;

function init(ext) {
	self = ext;

	ReasonFullScreen = "Inhibit by %s for full screen".format(self.getName());
	ReasonUserApps = "Inhibit by %s for user apps".format(self.getName());
	
	signalWindowCreatedId = self.func.get_display().connect_after('window-created', Lang.bind(self, function (display, window, noRecurse) {
		listenWindow(window);
	}));
	signalWindowDestroyedId = global.window_manager.connect('destroy', Lang.bind(self, function (shellwm, actor) {
		destroy(actor.meta_window);
	}));
    // Enable caffeine when fullscreen app is running
	if (self._settings.get_boolean(FULLSCREEN_KEY)) {
		mainloopFullScreenId = Mainloop.timeout_add_seconds(2, Lang.bind(self, function() {
	      	// handle apps in fullcreen
	  		signalInFullscreenId = self.func.get_screen().connect('in-fullscreen-changed', Lang.bind(self, function (screen) {
	  	    	toggleFullscreen(self.func.get_display(screen).get_focus_window())
	  		}));
	  	}));
	}

	mainloopWindowId = Mainloop.timeout_add_seconds(2, Lang.bind(self, function() {
		global.get_window_actors().map(Lang.bind(self, function(actor) {
			listenWindow(actor.meta_window);
        }));
	}));
}

function list() {
	return windows;
}

function listenWindow(window) {
	let app_id = getWindowID(window);
	let size_changed = window.connect('size-changed', Lang.bind(self, toggleFullscreen));
	let item = {'window': window, 'size_changed': size_changed };
	windows[app_id] = item;
	toggleFullscreen(window);
	inhibitUserApp(window);
}

// cause no identity id exists in metawindow object
// this method make caffeine to identity per window precisely
function getWindowID(window) {
	if (window.__id != undefined) return window.__id;
	let app_name = window.get_wm_class_instance();
	
	window.__id = app_name+':xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
	    return v.toString(16);
	});
	
	return window.__id;
}

function toggleFullscreen(window) {
	let app_id = "%s-FullScreen".format(getWindowID(window));
	if (inUserApps(window)) return;
	
	if (window.is_fullscreen()) {
		self.inhibitor.add(app_id, ReasonFullScreen, window.get_pid());
	} else {
		self.inhibitor.remove(app_id);
	}
}

function inhibitUserApp(window) {
	let app_id = "%s-UserApps".format(getWindowID(window));
	
	if (inUserApps(window)) {
		self.inhibitor.add(app_id, ReasonUserApps, window.get_pid());
	}
}

function inUserApps(window) {
	let app = Shell.WindowTracker.get_default().get_window_app(window);
	if (app) {
		let app_id = app.get_id();
		let apps = self._settings.get_strv(INHIBIT_APPS_KEY);
		if (apps.indexOf(app_id) != -1) return true;
	}
	
	return false;
}
function isInhibited(window) {
	let inhibitors = self.inhibitor.list();
	var app_id = getWindowID(window);
	let app_id_fullScreen = "%s-FullScreen".format(app_id);
	let app_id_userApps = "%s-UserApps".format(app_id);
	
	for (var index in inhibitors) 
		if (inhibitors[index]["app_id"] == app_id_fullScreen || inhibitors[index]["app_id"] == app_id_userApps) 
			return true;
	
	if (!self._settings.get_boolean(ADDRESS_INHIBITOR_KEY)) return false;
	
	let pid = window.get_pid();
	for (var index in inhibitors) 
		if (inhibitors[index]["pid"] != undefined && inhibitors[index]["pid"] == pid)
			return true;
	
	let app_name = window.get_wm_class_instance().toLowerCase();
	for (var index in inhibitors) {
		var app_id = inhibitors[index]["app_id"].toLowerCase();
		if (app_id.indexOf(app_name) != -1) return true;
	}
	
	app_name = window.get_wm_class().toLowerCase();
	for (var index in inhibitors) {
		var app_id = inhibitors[index]["app_id"].toLowerCase();
		if (app_id.indexOf(app_name) != -1) return true;
	}
	
	return false;
}

function destroy(window) {
	let app_id = getWindowID(window);
	let app_id_fullScreen = "%s-FullScreen".format(app_id);
	let app_id_userApps = "%s-UserApps".format(app_id);

	self.inhibitor.remove(app_id_fullScreen);
	self.inhibitor.remove(app_id_userApps);
	
	if (windows[app_id]) {
		window.disconnect(windows[app_id]['size_changed']);
		delete windows[app_id]['window'];
		delete windows[app_id];
    }
}

function kill() {
	if (signalWindowCreatedId) {
		self.func.get_display().disconnect(signalWindowCreatedId);
		signalWindowCreatedId = 0;
	}
	if (signalWindowDestroyedId) {
		global.window_manager.disconnect(signalWindowDestroyedId);
		signalWindowDestroyedId = 0;
	}
	if (signalInFullscreenId) {
		self.func.get_screen().disconnect(signalInFullscreenId);
		signalInFullscreenId = 0;
	}
	for (var index in windows) {
		if (windows[index]['size_changed'] != undefined) {
			windows[index]['window'].disconnect(windows[index]['size_changed']);
			delete windows[index]['window'];
			delete windows[index];
	    }
	}

	Mainloop.source_remove(mainloopFullScreenId);
	Mainloop.source_remove(mainloopWindowId);
}


