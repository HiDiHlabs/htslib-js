#include "htslib/faidx.h"

void pileup(htsFile *, hts_idx_t*, faidx_t*, const char*, void (*callback)(const char*, int, char, int));
