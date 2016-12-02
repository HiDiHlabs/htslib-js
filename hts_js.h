#include "htslib/hts.h"
#include "htslib/bgzf.h"

htsFile *hts_hopen_js(struct hFILE*, char*, const char*);
void hts_hclose_js(htsFile*);
