BUNDLE_PATH = "caffeine@patapon.info.zip"
EXTENSION_DIR = "caffeine@patapon.info"

all: build install

.PHONY: build install clean translations lint lint-fix

build:
	rm -f $(BUNDLE_PATH)
	cd $(EXTENSION_DIR); \
	gnome-extensions pack --force --podir=locale \
	                      --extra-source=preferences/ \
	                      --extra-source=icons/ \
	                      --extra-source=mprisMediaPlayer2.js; \
	mv $(EXTENSION_DIR).shell-extension.zip ../$(BUNDLE_PATH)

install:
	gnome-extensions install $(BUNDLE_PATH) --force

clean:
	@rm -fv $(BUNDLE_PATH)
	@rm -fv $(EXTENSION_DIR)/schemas/gschemas.compiled

translations:
	@./update-locale.sh

lint:
	eslint -c .eslintrc.yml --resolve-plugins-relative-to "$(shell npm root -g)" $(EXTENSION_DIR)

lint-fix:
	eslint -c .eslintrc.yml --resolve-plugins-relative-to "$(shell npm root -g)" --fix $(EXTENSION_DIR)
