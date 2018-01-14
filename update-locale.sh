#!/bin/bash

cd caffeine-plus@patapon.info

pot=gnome-shell-extension-caffeine-plus.pot

touch $pot
xgettext -j *.js -o $pot
xgettext -j schemas/*.xml -o $pot

for locale_lang in locale/*; do
    po=$locale_lang/LC_MESSAGES/gnome-shell-extension-caffeine-plus.po
    echo $po
    msgmerge --backup=off -U $po $pot
    msgfmt $po -o ${po%po}mo
done

rm $pot
