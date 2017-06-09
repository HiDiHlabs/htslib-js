#include "htslib/hts.h"
#include "htslib/bgzf.h"

htsFile *hts_hopen_js(struct hFILE*, char*, const char*);
hts_idx_t *hts_idx_load_js(htsFile*);
void hts_hclose_js(htsFile*);
void hts_idx_destroy_js(hts_idx_t*);
