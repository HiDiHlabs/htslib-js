#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

RELEASE_FLAGS='-O3'
CC=g++
HEADERS='-I.'

cd htslib_native
make
cd ..

$CC $HEADERS $RELEASE_FLAGS -c digenome.cpp -o digenome.o
$CC $HEADERS $RELEASE_FLAGS -c test_native.cpp -o test_native.o

$CC test_native.o digenome.o htslib_native/libhts.a -pthread -lz $HEADERS $RELEASE_FLAGS -o digenome

