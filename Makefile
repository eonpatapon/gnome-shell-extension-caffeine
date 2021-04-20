all: build install

.PHONY: build install lint

build:
	./update-locale.sh
	glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas

install:
	install -d ~/.local/share/gnome-shell/extensions
	cp -a caffeine@patapon.info/ ~/.local/share/gnome-shell/extensions/

lint:
	eslint caffeine@patapon.info
