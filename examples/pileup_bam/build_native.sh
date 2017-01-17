#!/bin/bash

set -x

# TODO: convert it to be a proper Makefile

RELEASE_FLAGS='-O3'
CC=g++
HEADERS='-I.'

$CC $HEADERS $RELEASE_FLAGS -c pileup.cpp -o pileup.o
$CC $HEADERS $RELEASE_FLAGS -c interface_native.cpp -o interface_native.o

$CC interface_native.o pileup.o -lhts $HEADERS $RELEASE_FLAGS -o pileup
