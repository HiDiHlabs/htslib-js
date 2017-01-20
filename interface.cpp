#include <emscripten.h>
#include <stdlib.h>
#include <map>

#include "interface.h"

file_map htsFiles;

extern "C" {
    // JavaScript interface
    int hts_open_js(int fd, char* fn) {
        if (htsFiles.find(fd) != htsFiles.end()) return 1;

        hFILE* h_f = hopen_js(fd);
        htsFile* f = hts_hopen_js(h_f, fn, "r");
        htsFiles[fd] = f;

        return 0;
    }

    // JavaScript interface
    void hts_close_js(int fd) {
        delete htsFiles[fd];
    }
}
