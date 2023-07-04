#!/usr/bin/env sh

cd caffeine@patapon.info || exit 1

pot="gnome-shell-extension-caffeine.pot"

touch "$pot"
xgettext -j ./*.js -o "$pot" --from-code UTF-8 --no-wrap
xgettext -j preferences/*.js -o "$pot" --from-code UTF-8 --no-wrap
xgettext -j schemas/*.xml -o "$pot" --from-code UTF-8 --no-wrap

for po in locale/*; do
    echo "$po"
    msgmerge --backup=off -U "$po" "$pot"
done

rm "$pot"
