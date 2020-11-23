#!/bin/sh

rm -f caffeine@patapon.info.zip
glib-compile-schemas --strict --targetdir=caffeine@patapon.info/schemas/ caffeine@patapon.info/schemas
cd caffeine@patapon.info && zip -r ../caffeine@patapon.info.zip *
