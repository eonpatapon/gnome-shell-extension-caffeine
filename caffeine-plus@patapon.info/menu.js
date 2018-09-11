
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const CheckBox = imports.ui.checkBox;
const Shell = imports.gi.Shell;

const disableSuspendIcon = {'app': 'my-caffeine-on-symbolic', 'user': 'my-caffeine-on-symbolic-user'};

const USER_ENABLED_KEY = 'user-enabled';
const titleLength = 100;

let self;

let signalRestackedId;
let signalKeyFocusInId;
let signalButtonPressEventId;
let signalKeyReleaseEventId;
function init(ext) {
	self = ext;

	signalRestackedId = self.func.get_screen().connect('restacked', Lang.bind(self, show));
	signalKeyFocusInId = self.actor.connect('key-focus-in', Lang.bind(self, show));
	signalButtonPressEventId = self.actor.connect('button-press-event', Lang.bind(self, show));
	signalKeyReleaseEventId = self.actor.connect_after('key-release-event', Lang.bind(self, function (actor, event) {
		let symbol = event.get_key_symbol();
		if (symbol == Clutter.KEY_Return || symbol == Clutter.KEY_space) {
			show();
		}
	}));
}

function buildCheckBox() {
    let item = new PopupMenu.PopupMenuItem("");
    let box = new St.BoxLayout( { x_expand: true  } );
    
    var cb = new CheckBox.CheckBox();
    cb.getLabelActor().text = _("Inhibit suspend globally");
    cb.actor.checked = self._settings.get_boolean(USER_ENABLED_KEY);
    cb.actor.connect('clicked', Lang.bind(self, self.userToggleState));
    cb.actor.set_size("720", "24")
    
    box.add(cb.actor);
    box.add(new St.Label({ text: ' ' }));
    item.actor.add_actor(box);
    item.actor.reactive = false;
    item.actor.can_focus = true;
    item.connect('activate', Lang.bind(self, self.userToggleState));
    self.menu.addMenuItem(item);
    self.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    //////////////////////////////////////////////////////////
    let inhibitors = self.inhibitor.list();
    for ( var index in inhibitors) {
    	let inhibitor = inhibitors[index];

        let item = new PopupMenu.PopupMenuItem('');
        
        let box = new St.BoxLayout( { x_expand: true  } );
        box.add(new St.Icon({
            icon_name: disableSuspendIcon['app'],
            icon_size: 22
        }));
        box.add(new St.Label({ text: ' ' }));
        box.add(new St.Label({ text: ' ' }));
        
        let reason = 'might be playing video';
        if (inhibitor['reason'] != undefined) reason = inhibitor['reason'];
        let title = '[' + inhibitor['type'] + ']' + inhibitor['app_id'] + ' ' + reason;
        box.add(new St.Label({ text: title, x_expand: true }));
        item.actor.add_actor(box);
        item.actor.reactive = false;
        item.actor.can_focus = false;
        self.menu.addMenuItem(item);
    }
    if (inhibitors.length)
    	self.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
}

function buildMenuItems(window_list) {
	let tracker = Shell.WindowTracker.get_default();
	for (var index in window_list) {
		if (index > 0) {
            self.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

			let workspace_name = Meta.prefs_get_workspace_name(index-1);
            let item = new PopupMenu.PopupMenuItem(workspace_name);
            
            item.actor.reactive = false;
            item.actor.can_focus = false;
            if(index == self.func.get_active_workspace_index() + 1)
                item.setOrnament(PopupMenu.Ornament.DOT);

            self.menu.addMenuItem(item);
		}

        for ( let i = 0; i < window_list[index].length; ++i ) {
            let metaWindow = window_list[index][i];
            let app = tracker.get_window_app(metaWindow);
            if (!app) continue;

            let item = new PopupMenu.PopupMenuItem('');
            
            item.connect('activate', Lang.bind(self, function() { activateWindow(metaWindow.get_workspace(), metaWindow); } ));
            
            let box = new St.BoxLayout( { x_expand: true  } );
            
            item._icon = app.create_icon_texture(24);
            if (self.window.isInhibited(metaWindow)) {
                box.add(new St.Icon({
                    icon_name: disableSuspendIcon['app'],
                    icon_size: 22
                }));
                box.add(new St.Label({ text: ' ' }));
            	
            }
            box.add(item._icon);
            box.add(new St.Label({ text: ' ' }));
            
            let title = metaWindow.get_title();
            if (title.length > titleLength) title = title.substr(0, titleLength)+'...';
            box.add(new St.Label({ text: title, x_expand: true }));
            item.actor.add_actor(box);
            self.menu.addMenuItem(item);
        }
	}
}

function show() {
    self.menu.removeAll();

    buildCheckBox();
    
    let windows = self.window.list();
	if (!Object.keys(windows).length) {
        let item = new PopupMenu.PopupMenuItem(_("No open windows"))
        
        item.actor.reactive = false;
        item.actor.can_focus = false;
        self.menu.addMenuItem(item);

    	self.actor.show();
		return;
	}
	
	let n_workspaces = self.func.get_screen().n_workspaces;
	let window_list = [];
	for (var index in windows) {
		var window = windows[index]['window'];
		let workspace = window.get_workspace();

		if ( window.is_skip_taskbar() || window.is_on_all_workspaces() || workspace == null) {
			if (window_list[0] == undefined) window_list[0] = [];
    		window_list[0].push(window);
			continue;
		}

		let workspace_index = workspace.index()+1;
		
		if (window_list[workspace_index] == undefined) window_list[workspace_index] = [];
		window_list[workspace_index].push(window);
	}

    buildMenuItems(window_list);

	self.actor.show();
}

function activateWindow(metaWorkspace, metaWindow) {
    if(!metaWindow.is_on_all_workspaces()) { metaWorkspace.activate(global.get_current_time()); }
    metaWindow.unminimize(global.get_current_time());
    metaWindow.unshade(global.get_current_time());
    metaWindow.activate(global.get_current_time());
}

function kill() {

	if (signalRestackedId) {
		self.func.get_screen().disconnect(signalRestackedId);
		signalRestackedId = 0;
	}

	if (signalKeyFocusInId) {
		self.actor.disconnect(signalKeyFocusInId);
		signalKeyFocusInId = 0;
	}

	if (signalButtonPressEventId) {
		self.actor.disconnect(signalButtonPressEventId);
		signalButtonPressEventId = 0;
	}

	if (signalKeyReleaseEventId) {
		self.actor.disconnect(signalKeyReleaseEventId);
		signalKeyReleaseEventId = 0;
	}
}



