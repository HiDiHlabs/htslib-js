#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

#cd htslib
#make
#cd ..

RELEASE_FLAGS='-O3'
HEADERS='-I. -Ihtslib -Izlib'
CC=/usr/local/emscripten/em++
AR=/usr/local/emscripten/emar
RANLIB=/usr/local/emscripten/emranlib

$CC $HEADERS $RELEASE_FLAGS -c hfile_js.cpp -o hfile_js.o
$CC $HEADERS $RELEASE_FLAGS -c hts_js.cpp -o hts_js.o
$CC $HEADERS $RELEASE_FLAGS -c faidx_js.cpp -o faidx_js.o
$CC $HEADERS $RELEASE_FLAGS -c interface.cpp -o interface.o

$AR rc libhts_js.a hfile_js.o hts_js.o faidx_js.o interface.o
$RANLIB libhts_js.a
