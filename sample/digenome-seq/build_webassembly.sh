#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

cd htslib
make
cd ..

#RELEASE_FLAGS='--memory-init-file 0 --llvm-lto 1 -s NO_FILESYSTEM=1 -s BUILD_AS_WORKER=1 -s EXPORTED_RUNTIME_METHODS="[]"'
RELEASE_FLAGS='-O3 --memory-init-file 0 --llvm-lto 1 -s NO_FILESYSTEM=1 -s BUILD_AS_WORKER=1 -s EXPORTED_RUNTIME_METHODS="[]" -s BINARYEN="/data/binaryen/"'
HEADERS='-I. -Ihtslib -Izlib'
CC=/usr/local/emscripten/em++

$CC $HEADERS $RELEASE_FLAGS hfile_js.cpp -o hfile_js.bc
$CC $HEADERS $RELEASE_FLAGS hts_js.cpp -o hts_js.bc
$CC $HEADERS $RELEASE_FLAGS interface.cpp -o interface.bc
$CC $HEADERS $RELEASE_FLAGS digenome.cpp -o digenome.bc

$CC digenome.bc interface.bc hfile_js.bc hts_js.bc htslib/libhts.a zlib/libz.a $HEADERS --post-js post.js -s EXPORTED_FUNCTIONS="['_bgzf_open_js', '_bgzf_close_js', '_run_digenome', '_run_pileup']" $RELEASE_FLAGS -o htslib_worker_webassembly.js

#$CC pileup.bc digenome.bc interface.bc hfile_js.bc hts_js.bc htslib/libhts.a zlib/libz.a $HEADERS --separate-asm --post-js <(echo "self['Module'] = Module; self['Pointer_stringify'] = Pointer_stringify;") -s EXPORTED_FUNCTIONS="['_bgzf_open_js', '_bgzf_close_js', '_run_digenome', '_run_pileup']" $RELEASE_FLAGS -o htslib_worker.js
#cat post.js >> htslib_worker.js
#echo "var Module;if(!Module)Module=(typeof Module!=="undefined"?Module:null)||{};" | cat - htslib_worker.asm.js > htslib_worker.asm.tmp && mv htslib_worker.asm.tmp htslib_worker.asm.js
