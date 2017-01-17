#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

RELEASE_FLAGS='-O3 --memory-init-file 0 --llvm-lto 1 -s NO_FILESYSTEM=1 -s BUILD_AS_WORKER=1 -s EXPORTED_RUNTIME_METHODS="[]"'
HEADERS='-I. -I../.. -I../../htslib -I../../zlib'
CC=/usr/local/emscripten/em++

$CC $HEADERS $RELEASE_FLAGS -c pileup.cpp -o pileup.o
$CC $HEADERS $RELEASE_FLAGS -c interface_js.cpp -o interface_js.o

cat post.js ../../post.js > post_combined.js

$CC interface_js.o pileup.o ../../libhts_js.a ../../htslib/libhts.a ../../zlib/libz.a $HEADERS --post-js post_combined.js -s EXPORTED_FUNCTIONS="['_hts_open_js', '_hts_close_js', '_run_pileup']" $RELEASE_FLAGS -o pileup.js
