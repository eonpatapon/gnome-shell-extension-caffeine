#!/usr/bin/env sh

cd caffeine@patapon.info || exit 1

pot="gnome-shell-extension-caffeine.pot"

touch "$pot"
xgettext -j ./*.js -o "$pot" --from-code UTF-8 --no-wrap
xgettext -j schemas/*.xml -o "$pot" --from-code UTF-8 --no-wrap

for locale_lang in locale/*; do
    po="$locale_lang/LC_MESSAGES/gnome-shell-extension-caffeine.po"
    echo "$po"
    msgmerge --backup=off -U "$po" "$pot"
    msgfmt "$po" -o "${po%po}mo"
done

rm "$pot"
