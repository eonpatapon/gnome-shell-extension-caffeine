#!/bin/bash

for po in `find . -name '*.po'`
do
    mo=`echo $po | sed 's/\.po$/.mo/'`
    msgfmt -o $mo $po
done
