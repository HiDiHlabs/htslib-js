#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

#cd htslib
#make
#cd ..

RELEASE_FLAGS='-O3'
HEADERS='-I. -Ihtslib -Izlib'
CC=/usr/local/emscripten/em++

$CC $HEADERS $RELEASE_FLAGS hfile_js.cpp -o hfile_js.bc
$CC $HEADERS $RELEASE_FLAGS hts_js.cpp -o hts_js.bc
$CC $HEADERS $RELEASE_FLAGS interface.cpp -o interface.bc

$CC interface.bc hfile_js.bc hts_js.bc htslib/libhts.a zlib/libz.a $RELEASE_FLAGS -o libhts_js.a
