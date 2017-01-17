#include <emscripten.h>
#include <htslib/sam.h>
#include <htslib/kstring.h>
#include <stdlib.h>
#include <string.h>
#include <map>
#include <stdio.h>

#include "hts_js.h"
#include "hfile_js.h"

std::map<int, htsFile*> file_map;

extern "C" {
    // JavaScript interface
    int hts_open_js(int fid) {
        if (file_map.find(fid) != file_map.end()) return 1;

        hFILE* h_bam = hopen_js(fid);
        char *fn = (char *)EM_ASM_INT({
            return allocate(intArrayFromString(self['htsfiles'][$0]['fileobj'].name), 'i8', ALLOC_NORMAL);
        }, fid);

        htsFile* bam = hts_hopen_js(h_bam, fn, "rb");
        free((void *)fn); // fn is duplicated in hts_hopen_js
        file_map[fid] = bam;

        return 0;
    }

    // JavaScript interface
    void hts_close_js(int fd) {
        //hts_close(file_map[fd]); // TODO: incompatible?
        delete file_map[fd];
    }
}
