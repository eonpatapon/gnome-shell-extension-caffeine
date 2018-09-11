/**
 * http://usejsdoc.org/
 */

const Config = imports.misc.config;
let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

function get_screen() {
	if (ShellVersion > 28)
		return global.display
		
	return global.screen
}

function get_display(screen) {
	if (ShellVersion > 28) {
		if (screen == undefined)
			return global.display;
		
		return screen;
	}
		
	if (screen == undefined)
		return global.screen.get_display();
	
	return screen.get_display();
}

function get_active_workspace_index() {
	if (ShellVersion > 28) {
		let workspaceManager = global.workspace_manager;
	    return workspaceManager.get_active_workspace_index();
	}
		
	return global.screen.get_active_workspace_index();
}