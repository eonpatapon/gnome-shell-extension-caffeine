# gnome-shell-extension-caffeine

Täida tass tõkestamaks ekraanisäästjat ja ise-uinumist.

See laiendus toetab “gnome-shell” versioone 3.4 kuni 3.22.

Kasuta “gnome-shell-before-3.10” haru vanematele Gnome kesta versioonidele 3.4, 3.6 ja 3.8.

![Screenshot](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot.png)

![Eelistused](https://github.com/janls/gnome-shell-extension-caffeine/raw/master/et.screenshot-prefs.png)

* __Tühi tass__ = ise-uinumine ja ekraanisäästja süsteemi sättete alusel.
* __Täis tass__ = ise-uinumine ja ekraanisäästja tõkestatud.

## Paigaldamine ametlikult Gnome laienduste kodulehelt:

https://extensions.gnome.org/extension/517/caffeine/

## Paigaldamine git vahendusel (_eestindatud_)

    git clone git://github.com/janls/gnome-shell-extension-caffeine.git
    cd gnome-shell-extension-caffeine
    ./update-locale.sh
    glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas
    cp -r caffeine@patapon.info ~/.local/share/gnome-shell/extensions

Taaskäivita kest ning luba laiendus:

1. Vajuta korraga alla klahvid <kbd>Alt</kbd> ja <kbd>F2</kbd>,
 : selle peale avaneb aken “Palun sisesta käsk”.
2. Trüki avanenud aknasse “__r__” ja vajuta klahvi <kbd>Enter</kbd>.
