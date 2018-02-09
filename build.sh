#!/bin/bash
./update-locale.sh
glib-compile-schemas --strict --targetdir=caffeine-plus@patapon.info/schemas/ caffeine-plus@patapon.info/schemas
