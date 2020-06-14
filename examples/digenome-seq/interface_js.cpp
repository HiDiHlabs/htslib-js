#include <emscripten.h>
#include <map>

#include "digenome.h"  

#include <iostream>

void callback_progress(float p) {
    EM_ASM_ARGS({
        postMessage([0, $0]); // The first argument is for message classification
    }, p);
}

void callback_digenome(char *chrom, int pos, int f, int r, int fd, int rd, float fr, float rr, float sc) {
    EM_ASM_ARGS({
        postMessage([2, UTF8ToString($0), $1, $2, $3, $4, $5, $6, $7, $8]); // The first argument is for message classification
    }, chrom, pos, f, r, fd, rd, fr, rr, sc);
}

extern "C" {
    int run_digenome(char* bam_path, int min_mapq, int gap, int min_read_f, int min_read_r, float min_score, int min_depth, float min_ratio) {
        htsFile *fp = sam_open(bam_path, "rb");
        digenome(fp, min_mapq, gap, min_read_f, min_read_r, min_score, min_depth, min_depth, min_ratio, min_ratio, callback_progress, callback_digenome);
        sam_close(fp);
        return 0;
    }
}
