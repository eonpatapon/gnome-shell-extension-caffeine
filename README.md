# gnome-shell-extension-caffeine

[<img src="https://github.com/pakaoraki/gnome-shell-extension-caffeine/raw/master/ressources/get_it_on_gnome_extensions.png" height="100" align="right">](https://extensions.gnome.org/extension/517/caffeine/)

[![License](https://img.shields.io/github/license/eonpatapon/gnome-shell-extension-caffeine)](https://github.com/eonpatapon/gnome-shell-extension-caffeine/blob/master/LICENSE)
[![GitHub release (latest by date)](https://img.shields.io/github/v/tag/eonpatapon/gnome-shell-extension-caffeine)](https://github.com/eonpatapon/gnome-shell-extension-caffeine/releases/latest)

Enable/Disable auto suspend with quick setting toggle.

![Quick Toggle Caffeine](screenshots/screenshot.png)


###  ⚠️  __This extension is barely maintained anymore, new maintainers are welcome !__
&nbsp;

## Version
This extension supports GNOME Shell `3.4` -> `43`

|Branch|Version|Compatible Gnome version|
|---|:---:|---|
| master  | 43 | Gnome 43  |
| gnome-shell-40-43  | 42 | Gnome 40 -> 43  |
| gnome-shell-3.36-3.38: 3.36 | 37 | Gnome 3.36 -> 3.38 |
| gnome-shell-3.32-3.34 | 33 | Gnome 3.32 -> 3.34 |
| gnome-shell-3.10-3.30 | - | Gnome 3.10 -> 3.30 |
| gnome-shell-before-3.10 | - | Gnome 3.4 -> 3.8 |

&nbsp;

## Installation From source

```
make build
make install
```
  - Restart the shell
  - Enable the extension
&nbsp;

## Screenshots & features


### <ins>Scroll Indicator Icon</ins>
![Screenshot](screenshots/screenshot-scroll-up.png)![Screenshot](screenshots/screenshot-scroll-down.png)

You can scroll on the indicator icon to Enable/disable auto suspend:

- Scroll UP -> Filled cup : auto suspend and screensaver off. 
- Scroll DOWN -> Empty cup : normal auto suspend and screensaver.

<ins>__Note__</ins>: the option "Show status indicator" must be set on "always" (see below).
&nbsp;

### <ins>Notifications</ins>
![Screenshot](screenshots/screenshot-notification-enable.png)
![Screenshot](screenshots/screenshot-notification-disable.png)
&nbsp;

### <ins>Timer option</ins>
This option enable Caffeine for a given amount of time (similar to Caffeine in LineageOS).

![Screenshot](screenshots/screenshot-timer-off.png)![Screenshot](screenshots/screenshot-timer-on.png)
&nbsp;

### <ins>Preferences</ins>
![Preferences](screenshots/screenshot-prefs.png)


## CLI

- Get current state:
  ```sh
  gsettings --schemadir ~/.local/share/gnome-shell/extensions/caffeine@patapon.info/schemas/ get org.gnome.shell.extensions.caffeine user-enabled
  ```
- Enable Caffeine:
  ```sh
  gsettings --schemadir ~/.local/share/gnome-shell/extensions/caffeine@patapon.info/schemas/ set org.gnome.shell.extensions.caffeine user-enabled true
  ```
- Disable Caffeine:
  ```sh
  gsettings --schemadir ~/.local/share/gnome-shell/extensions/caffeine@patapon.info/schemas/ set org.gnome.shell.extensions.caffeine user-enabled false
  ```

`--schemadir` — path to the extension schemas directory. It may be different on your system.
