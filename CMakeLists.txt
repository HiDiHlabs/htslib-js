cmake_minimum_required(VERSION 3.0)
project(htslib_js)

include(CheckLibraryExists)
include(CheckIncludeFiles)
include(CheckFunctionExists)


# Set environment variables

set(CMAKE_CXX_STANDARD 11)

set(PACKAGE_VERSION "1.2.1-195-g81b173e")

string(REGEX MATCH "nodejs\"$" IS_EMSCRIPTEN "${CMAKE_CROSSCOMPILING_EMULATOR}")


# Create config.h

check_library_exists(CommonCrypto CCHmac "" HAVE_COMMONCRYPTO)
check_function_exists(fdatasync HAVE_FDATASYNC)
check_function_exists(getpagesize HAVE_GETPAGESIZE)
check_function_exists(gmtime_r HAVE_GMTIME_R)
check_function_exists(HMAC HAVE_HMAC)
check_include_files(inttypes.h HAVE_INTTYPES_H)
check_library_exists(curl curl_easy_init "" HAVE_LIBCURL)
check_library_exists(z deflate "" HAVE_LIBZ)
check_include_files(memory.h HAVE_MEMORY_H)
check_function_exists(mmap HAVE_MMAP)
check_include_files(stdint.h HAVE_STDINT_H)
check_include_files(stdlib.h HAVE_STDLIB_H)
check_include_files(strings.h HAVE_STRINGS_H)
check_include_files(string.h HAVE_STRING_H)
check_include_files(sys/param.h HAVE_SYS_PARAM_H)
check_include_files(sys/stat.h HAVE_SYS_STAT_H)
check_include_files(sys/types.h HAVE_SYS_TYPES_H)
check_include_files(unistd.h HAVE_UNISTD_H)

configure_file(config.h.in
        ${PROJECT_BINARY_DIR}/config.h)


# Create version.h

file(WRITE ${PROJECT_BINARY_DIR}/version.h "#define HTS_VERSION \"${PACKAGE_VERSION}\"")


# Include directories

# try setting EMPSCRIPTEN_INCLUDE_DIR to emscripten/system/include
include_directories(
    ${EMSCRIPTEN_INCLUDE_DIR}
    ${PROJECT_BINARY_DIR}
    ${PROJECT_BINARY_DIR}/zlib
    htslib
    htslib/curl
    zlib
)

# zlib

add_subdirectory(zlib)


# htslib

set(SOURCES
    htslib/hfile_internal.h
    htslib/hts_internal.h
    htslib/thread_pool_internal.h

    htslib/bgzf.c
    htslib/bgzip.c
    htslib/errmod.c
    htslib/faidx.c
    htslib/hfile.c
    htslib/hfile_net.c
    htslib/hts.c
    htslib/htsfile.c
    htslib/kfunc.c
    htslib/knetfile.c
    htslib/kstring.c
    htslib/md5.c
    htslib/probaln.c
    htslib/realn.c
    htslib/regidx.c
    htslib/sam.c
    htslib/synced_bcf_reader.c
    htslib/tabix.c
    htslib/tbx.c
    htslib/thread_pool.c
    htslib/vcf.c
    htslib/vcf_sweep.c
    htslib/vcfutils.c

    htslib/cram/cram_codecs.c
    htslib/cram/mFILE.c
    htslib/cram/cram_decode.c
    htslib/cram/open_trace_file.c
    htslib/cram/cram_encode.c
    htslib/cram/pooled_alloc.c
    htslib/cram/cram_external.c
    htslib/cram/rANS_static.c
    htslib/cram/cram_index.c
    htslib/cram/sam_header.c
    htslib/cram/cram_io.c
    htslib/cram/string_alloc.c
    htslib/cram/cram_samtools.c
    htslib/cram/vlen.c
    htslib/cram/cram_stats.c
    htslib/cram/zfio.c
    htslib/cram/files.c
)

if(ENABLE_PLUGINS)
    set(SOURCES ${SOURCES} htslib/plugin.c)
endif()

if(IS_EMSCRIPTEN)
    set(SOURCES ${SOURCES}
        hfile_js.cpp hfile_js.h
        hts_js.cpp hts_js.h
        interface.cpp interface.h
    )
endif()

add_library(hts ${SOURCES})
link_libraries(hts
    zlib
    pthread
)


# Examples

## pileup_bam

if(IS_EMSCRIPTEN)
    set(EXAMPLE_PILEUP_SOURCE 
        examples/pileup_bam/pileup.cpp
        examples/pileup_bam/interface_js.cpp
    )
else()
    set(EXAMPLE_PILEUP_SOURCE
        examples/pileup_bam/pileup.cpp
        examples/pileup_bam/interface_native.cpp
    )
endif()

add_executable(pileup_bam ${EXAMPLE_PILEUP_SOURCE})
target_link_libraries(pileup_bam hts)


## digenome-seq

if(IS_EMSCRIPTEN)
    set(EXAMPLE_PILEUP_SOURCE 
        examples/digenome-seq/digenome.cpp
        examples/digenome-seq/interface_js.cpp
    )
else()
    set(EXAMPLE_PILEUP_SOURCE
        examples/digenome-seq/digenome.cpp
        examples/digenome-seq/interface_native.cpp
    )
endif()

add_executable(digenome-seq ${EXAMPLE_PILEUP_SOURCE})
target_link_libraries(digenome-seq hts)

