#!/bin/bash

# TODO: convert it to be a proper Makefile

RELEASE_FLAGS='--memory-init-file 0 --closure 1 --llvm-lto 1 -s NO_FILESYSTEM=1 -s BUILD_AS_WORKER=1 -s EXPORTED_RUNTIME_METHODS="[]"'
#RELEASE_FLAGS='-O3 --memory-init-file 0 --closure 1 --llvm-lto 1 -s NO_FILESYSTEM=1 -s BUILD_AS_WORKER=1 -s EXPORTED_RUNTIME_METHODS="[]"'
HEADERS='-I. -Ihtslib -Izlib'
CC=/usr/local/emscripten/em++
POST_JS='--post-js post.js'
#POST_JS=
$CC $HEADERS $RELEASE_FLAGS hfile_js.cpp -o hfile_js.bc
$CC $HEADERS $RELEASE_FLAGS hts_js.cpp -o hts_js.bc
$CC $HEADERS $RELEASE_FLAGS interface.cpp -o interface.bc

$CC interface.bc hfile_js.bc hts_js.bc htslib/libhts.a zlib/libz.a $HEADERS $POST_JS -s EXPORTED_FUNCTIONS="['_bgzf_open_js', '_bgzf_close_js', '_test']" $RELEASE_FLAGS -o htslib_worker.js
