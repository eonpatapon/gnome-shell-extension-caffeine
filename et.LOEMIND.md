# gnome-shell-extension-caffeine

Täida tass tõkestamaks ekraanisäästjat ja ise-uinumist.

See laiendus toetab gnome-shell 3.4 kuni 3.22 versioone.

Kasuta “gnome-shell-before-3.10” haru vanemate gnome shell 3.4, 3.6 ja 3.8 versioonidele.

![Screenshot](https://github.com/eonpatapon/gnome-shell-extension-caffeine/raw/master/screenshot.png)

![Eelistused](https://github.com/janls/gnome-shell-extension-caffeine/blob/master/et.screenshot-prefs.png)

* Tühi tass = ise-uinumine ja ekraanisäästja süsteemi sättete alusel.
* Täidetud tass = ise-uinumine ja ekraanisäästja tõkestatud.

## Paigaldamine ametlikult Gnome laienduste kodulehelt:

https://extensions.gnome.org/extension/517/caffeine/

## Paigaldamine git vahendusel

    git clone git://github.com/eonpatapon/gnome-shell-extension-caffeine.git
    cd gnome-shell-extension-caffeine
    ./update-locale.sh
    glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas
    cp -r caffeine@patapon.info ~/.local/share/gnome-shell/extensions

Taaskäivita kest ning luba laiendus:
  1. Vajuta alla klahvid <kbd>Alt</kbd>+<kbd>F2</kbd>, ning 
  * trüki __“r”__ (_ilma jutumärkideta_) ja vajuta <kbd>Enter</kbd>.
