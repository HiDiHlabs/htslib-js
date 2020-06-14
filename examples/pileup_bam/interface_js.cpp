#include <emscripten.h>

#include "htslib/sam.h"
#include "pileup.h"

void callback_pileup(const char *chrom, int pos, char ref_base, int depth) {
    EM_ASM_ARGS({
        postMessage([2, Pointer_stringify($0), $1, String.fromCharCode($2), $3]); // The first argument is for message classification, 0 and 1 are already reserved internally
    }, chrom, pos, ref_base, depth);
}

extern "C" {
    int run_pileup(char* bam_file_name, char* bai_file_name, char* fasta_file_name, const char* reg) {
        faidx_t *fai = fai_load(fasta_file_name);
        hts_idx_t *bai = hts_idx_load(bai_file_name, HTS_FMT_BAI);
        htsFile *fp = sam_open(bam_file_name, "rb");
        pileup(fp, bai, fai, reg, callback_pileup);
        sam_close(fp);
        if (fai) fai_destroy(fai);
        if (bai) hts_idx_destroy(bai);
        return 0;
    }
}
