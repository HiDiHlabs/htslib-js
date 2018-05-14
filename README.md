htslib-js
======================

htslib-js is a software development toolkit (SDK) for compiling htslib using Emscripten.

Copyright 2016 Jeongbin Park and Liam Childs, All rights reserved.

License: LGPL

Prerequisites
----------------------

- Latest Emscripten SDK (<http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html>)
- CMake 3.4.3 or higher (<https://cmake.org/download/>)
- htslib (included in the source tree)
- zlib (included in the source tree)


Usage
----------------------

You can clone htslib-js by issuing below command:

   $ git clone --recurse-submodules https://github.com/eilslabs/htslib-js

Please make sure to use `--recurse-submodules` option here, to clone the submodule `htslib` required by htslib-js.

To build htslib-js, firstly you need Emscripten SDK and CMake. You can download sdk via this link: <http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html> and <https://cmake.org/download/>. We recommend to include CMake in system PATH or local user's PATH for convenience. On Windows, you may also need MinGW <http://www.mingw.org/> to use GNU build tools.

After install Emscripten SDK, required environment variables should be initialized by running:

In POSIX environment:

   $ emsdk activate
   
   $ source emsdk_env.sh

On Windows:

   > emsdk activate

After that, build htslib-js by running:

In POSIX environment:

   $ emcmake cmake -DCMAKE_BUILD_TYPE=Release .
   
   $ make

On Windows:

   > emcmake cmake -DCMAKE_BUILD_TYPE=Release . -G "MinGW Makefiles"
   
   > mingw32-make

And then the compiled JavaScript files and example html files will be generated under 'examples' directory.
