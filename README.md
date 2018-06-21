# This extension is not maintained anymore, it also suffer from a nasty bug #67. New maintainers are welcome!

## gnome-shell-extension-caffeine

_[Eesti][et_rme]_

Fill the cup to inhibit auto suspend and screensaver.

This extension supports gnome-shell 3.4 to 3.26.

Use the gnome-shell-before-3.10 branch for gnome shell 3.4, 3.6 and 3.8.

![Screenshot](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot.png)

![Preferences](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot-prefs.png)

Empty cup = normal auto suspend and screensaver. Filled cup = auto suspend and
screensaver off.

## Installation from e.g.o

https://extensions.gnome.org/extension/517/caffeine/

## Installation from git

    git clone git://github.com/eonpatapon/gnome-shell-extension-caffeine.git
    cd gnome-shell-extension-caffeine
    ./update-locale.sh
    glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas
    cp -r caffeine@patapon.info ~/.local/share/gnome-shell/extensions

Restart the shell and then enable the extension.


[et_rme]: https://github.com/janls/gnome-shell-extension-caffeine/blob/master/et.LOEMIND.md "Link version of readme in Estonian."
