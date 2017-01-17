#include <emscripten.h>
#include <stdlib.h>
#include <map>

#include "interface.h"

file_map htsFiles;

extern "C" {
    // JavaScript interface
    int hts_open_js(int fd) {
        if (htsFiles.find(fd) != htsFiles.end()) return 1;

        hFILE* h_bam = hopen_js(fd);
        char *fn = (char *)EM_ASM_INT({
            return allocate(intArrayFromString(self['htsfiles'][$0]['fileobj'].name), 'i8', ALLOC_NORMAL);
        }, fd);

        htsFile* bam = hts_hopen_js(h_bam, fn, "rb");
        free((void *)fn); // fn is duplicated in hts_hopen_js
        htsFiles[fd] = bam;

        return 0;
    }

    // JavaScript interface
    void hts_close_js(int fd) {
        //hts_close(file_map[fd]); // TODO: incompatible?
        delete htsFiles[fd];
    }
}
