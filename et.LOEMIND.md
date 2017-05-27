# gnome-shell-extension-caffeine

Täida tass tõkestamaks ekraanisäästjat ja ise-uinumist.

See laiendus toetab gnome-shell 3.4 kuni 3.22.

Kasuta gnome-shell-before-3.10 haru vanematele gnome shell 3.4, 3.6 ja 3.8.

![Screenshot](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot.png)

![Preferences](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot-prefs.png)

Tühi tass = ise-uinumine ja ekraanisäästja süsteemi sättete alusel. Täidetud tass = ise-uinumine ja ekraanisäästja tõkestatud.

## Paigaldamine ametlikult Gnome laienduste kodulehelt:

https://extensions.gnome.org/extension/517/caffeine/

## Paigaldamine git vahendusel

    git clone git://github.com/eonpatapon/gnome-shell-extension-caffeine.git
    cd gnome-shell-extension-caffeine
    ./update-locale.sh
    glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas
    cp -r caffeine@patapon.info ~/.local/share/gnome-shell/extensions

Taaskäivita kest ning luba laiendus.