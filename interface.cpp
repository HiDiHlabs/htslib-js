#include <emscripten.h>
#include <htslib/sam.h>
#include <htslib/kstring.h>
#include <stdlib.h>
#include <string.h>
#include <map>
#include <stdio.h>

#include "hts_js.h"
#include "hfile_js.h"
#include "digenome.h"

std::map<int, htsFile*> file_map;

void callback_digenome(char *chrom, int pos, int f, int r, int fd, int rd, float fr, float rr, float sc) {
    //printf("%s:%d\t%d\t%d\t%d\t%d\t%f\t%f\t%f\n", chrom, pos, f, r, fd, rd, fr, rr, sc);
    EM_ASM_ARGS({
        postMessage([2, Pointer_stringify($0), $1, $2, $3, $4, $5, $6, $7, $8]);
    }, chrom, pos, f, r, fd, rd, fr, rr, sc);
}

extern "C" {

int bgzf_open_js(int fid) {
    if (file_map.find(fid) != file_map.end()) return 1;

    hFILE* h_bam = hopen_js(fid);
    char *fn = (char *)EM_ASM_INT({
        return allocate(intArrayFromString(self['htsfiles'][$0]['fileobj'].name), 'i8', ALLOC_NORMAL);
    }, fid);

    htsFile* bam = hts_hopen_js(h_bam, fn, "rb");
    free((void *)fn);
    file_map[fid] = bam;

    return 0;
}

void bgzf_close_js(int fd) {
    //hts_close(file_map[fd]); // TODO: incompatible?
    delete file_map[fd];
}

int run_digenome(int fd, int min_mapq, int gap, int min_read_f, int min_read_r, float min_score, int min_depth, float min_ratio) {
    digenome(file_map[fd], min_mapq, gap, min_read_f, min_read_r, min_score, min_depth, min_depth, min_ratio, min_ratio, callback_digenome);
    return 0;
}

}
