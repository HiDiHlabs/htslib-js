#include <emscripten.h>

#include "interface.h"
#include "pileup.h" 

#include "hts_js.h"
#include "faidx_js.h"

void callback_pileup(const char *chrom, int pos, char ref_base, int depth) {
    EM_ASM_ARGS({
        postMessage([2, Pointer_stringify($0), $1, String.fromCharCode($2), $3]); // The first argument is for message classification, 0 and 1 are already reserved internally
    }, chrom, pos, ref_base, depth);
}

extern "C" {
    int run_pileup(int fd_bam, int fd_bai, int fd_fa, int fd_fai, const char* reg) {
        faidx_t *fai;
        hts_idx_t *bai;

        if (fd_fa == -1 || fd_fai == -1) fai = 0;
        else fai = fai_load_js(htsFiles[fd_fa], htsFiles[fd_fai], 0); // gzi is not supported yet

        if (fd_bai == -1) bai = 0;
        else bai = hts_idx_load_js(htsFiles[fd_bai]);

        pileup(htsFiles[fd_bam], bai, fai, reg, callback_pileup);

        if (fai) fai_destroy_js(fai);
        if (bai) hts_idx_destroy_js(bai);
        return 0;
    }
}
