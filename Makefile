all: build install

.PHONY: build install lint dist

build:
	./update-locale.sh
	glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas

dist: build
	rm -f caffeine@patapon.info.zip
	cd caffeine@patapon.info && zip -r ../caffeine@patapon.info.zip ./* --exclude \*.po --exclude \*.gschema.xml

install:
	install -d ~/.local/share/gnome-shell/extensions
	cp -a caffeine@patapon.info/ ~/.local/share/gnome-shell/extensions/

lint:
	eslint caffeine@patapon.info
