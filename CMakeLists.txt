cmake_minimum_required(VERSION 3.0)
project(htslib_js)

include(CheckLibraryExists)
include(CheckIncludeFiles)
include(CheckFunctionExists)


# Set environment variables

set(CMAKE_CXX_STANDARD 11)

set(PACKAGE_VERSION "1.2.1-195-g81b173e")

set(CMAKE_BUILD_TYPE Release)

if(${CMAKE_SYSTEM_NAME} STREQUAL "Emscripten")
    set(IS_EMSCRIPTEN TRUE)
    set(_LARGE_FILES 1)
    set(_FILE_OFFSET_BITS 64)
endif()

# Create config.h

check_function_exists(fdatasync HAVE_FDATASYNC)
check_function_exists(getpagesize HAVE_GETPAGESIZE)
check_function_exists(gmtime_r HAVE_GMTIME_R)
check_include_files(inttypes.h HAVE_INTTYPES_H)
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
set(HAVE_LIBZ on)

if(ENABLE_LIBCURL)
    check_function_exists(CCHmac HAVE_COMMONCRYPTO)
    check_library_exists(crypto HMAC "" HAVE_HMAC)
    if(HAVE_COMMONCRYPTO OR HAVE_HMAC)
        check_library_exists(curl curl_easy_init "" HAVE_LIBCURL)
    else()
        message(FATAL_ERROR "You need SSL development package to compile htslib with ENABLE_LIBCURL.")
    endif()

    if(NOT HAVE_LIBCURL)
        message(FATAL_ERROR "You need curl development package to compile htslib with ENABLE_LIBCURL.")
    endif()
else()
    set(HAVE_COMMONCRYPTO no)
    set(HAVE_HMAC no)
    set(HAVE_LIBCURL no)
endif()

configure_file(config.h.in
        ${PROJECT_BINARY_DIR}/config.h)


# Create version.h

file(WRITE ${PROJECT_BINARY_DIR}/version.h "#define HTS_VERSION \"${PACKAGE_VERSION}\"")


# Include directories

# try setting EMSCRIPTEN_INCLUDE_DIR to emscripten/system/include
include_directories(
    ${EMSCRIPTEN_INCLUDE_DIR}
    ${PROJECT_BINARY_DIR}
    ${PROJECT_BINARY_DIR}/zlib
    htslib
    htslib/curl
    zlib
    ${CMAKE_SOURCE_DIR}
)

# zlib

if(IS_EMSCRIPTEN)
    set( OFF64_T_run_result
         "8"
         CACHE STRING "Result from TRY_RUN" FORCE)

    set( OFF64_T_run_result__TRYRUN_OUTPUT
         "0"
         CACHE STRING "Output from TRY_RUN" FORCE)
endif()

add_subdirectory(zlib)

# htslib

file(GLOB SOURCES "${CMAKE_SOURCE_DIR}/htslib/*.h" "${CMAKE_SOURCE_DIR}/htslib/*.c" "${CMAKE_SOURCE_DIR}/htslib/cram/*.c")

list(REMOVE_ITEM SOURCES
    "${CMAKE_SOURCE_DIR}/htslib/tabix.c"
    "${CMAKE_SOURCE_DIR}/htslib/htsfile.c"
    "${CMAKE_SOURCE_DIR}/htslib/bgzip.c"
    "${CMAKE_SOURCE_DIR}/htslib/hfile_irods.c"
)

message(${SOURCES})

if(ENABLE_LIBCURL)
    link_libraries(curl crypto)
else()
    list(REMOVE_ITEM SOURCES "${CMAKE_SOURCE_DIR}/htslib/hfile_libcurl.c")
endif()

if(!ENABLE_PLUGINS)
    list(REMOVE_ITEM SOURCES "${CMAKE_SOURCE_DIR}/htslib/plugin.c")
endif()

set(LIBRARIES zlibstatic)
if(IS_EMSCRIPTEN)
    set(SOURCES ${SOURCES}
        hfile_js.cpp hfile_js.h
        hts_js.cpp hts_js.h
        faidx_js.cpp faidx_js.h
        interface.cpp interface.h
    )
else()
    set(LIBRARIES ${LIBRARIES} pthread)
endif()

add_library(hts ${SOURCES})
link_libraries(hts ${LIBRARIES})

# Examples
set (EXECUTABLE_OUTPUT_PATH ${PROJECT_BINARY_DIR}/examples)

## pileup_bam
if(IS_EMSCRIPTEN)
    set(EXAMPLE_SOURCE
        examples/pileup_bam/pileup.cpp
        examples/pileup_bam/interface_js.cpp
    )
else()
    set(EXAMPLE_SOURCE
        examples/pileup_bam/pileup.cpp
        examples/pileup_bam/interface_native.cpp
    )
endif()

add_executable(pileup_bam ${EXAMPLE_SOURCE})

if(IS_EMSCRIPTEN)
    set (CMAKE_EXE_LINKER_FLAGS "--post-js ${CMAKE_SOURCE_DIR}/post.js.in -s LINKABLE=1 -s EXPORT_ALL=1")
    set_target_properties(pileup_bam PROPERTIES LINK_FLAGS "--post-js ${CMAKE_SOURCE_DIR}/examples/pileup_bam/post.js.in")
    add_custom_command(TARGET pileup_bam POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_SOURCE_DIR}/examples/pileup_bam/test/pileup_bam.html ${PROJECT_BINARY_DIR}/examples/ &&
                ${CMAKE_COMMAND} -E copy ${CMAKE_SOURCE_DIR}/examples/pileup_bam/test/pileup_bam-worker.js ${PROJECT_BINARY_DIR}/examples/
    )
endif()

## digenome-seq

if(IS_EMSCRIPTEN)
    set(EXAMPLE_SOURCE
        examples/digenome-seq/digenome.cpp
        examples/digenome-seq/interface_js.cpp
    )
else()
    set(EXAMPLE_SOURCE
        examples/digenome-seq/digenome.cpp
        examples/digenome-seq/interface_native.cpp
    )
endif()

add_executable(digenome-seq ${EXAMPLE_SOURCE})
if(IS_EMSCRIPTEN)
    set_target_properties(digenome-seq PROPERTIES LINK_FLAGS "--post-js ${CMAKE_SOURCE_DIR}/examples/digenome-seq/post.js.in")
    add_custom_command(TARGET digenome-seq POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_SOURCE_DIR}/examples/digenome-seq/test/digenome-seq.html ${PROJECT_BINARY_DIR}/examples/ &&
                ${CMAKE_COMMAND} -E copy ${CMAKE_SOURCE_DIR}/examples/digenome-seq/test/digenome-seq-worker.js ${PROJECT_BINARY_DIR}/examples/
    )
endif()
