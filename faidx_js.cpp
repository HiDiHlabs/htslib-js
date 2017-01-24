#include <stdlib.h>
#include <errno.h>
#include <ctype.h>
#include <inttypes.h>
#include <stdio.h>

#include "htslib/faidx.h"
#include "htslib/hfile.h"
#include "htslib/kseq.h"
#include "htslib/khash.h"
#include "htslib/hts.h"
#include "htslib/bgzf.h"

#include "hts_internal.h"

typedef struct {
    int32_t line_len, line_blen;
    int64_t len;
    uint64_t offset;
} faidx1_t;
KHASH_MAP_INIT_STR(s, faidx1_t)

struct __faidx_t {
    BGZF *bgzf;
    int n, m;
    char **name;
    khash_t(s) *hash;
};

static inline int fai_insert_index(faidx_t *idx, const char *name, int64_t len, int line_len, int line_blen, uint64_t offset)
{
    if (!name) {
        fprintf(stderr, "[fai_build_core] malformed line\n");
        return -1;
    }

    char *name_key = strdup(name);
    int absent;
    khint_t k = kh_put(s, idx->hash, name_key, &absent);
    faidx1_t *v = &kh_value(idx->hash, k);

    if (! absent) {
        fprintf(stderr, "[fai_build_core] ignoring duplicate sequence \"%s\" at byte offset %" PRIu64 "\n", name, offset);
        free(name_key);
        return 0;
    }

    if (idx->n == idx->m) {
        char **tmp;
        idx->m = idx->m? idx->m<<1 : 16;
        if (!(tmp = (char**)realloc(idx->name, sizeof(char*) * idx->m))) {
            fprintf(stderr, "[fai_build_core] out of memory\n");
            return -1;
        }
        idx->name = tmp;
    }
    idx->name[idx->n++] = name_key;
    v->len = len;
    v->line_len = line_len;
    v->line_blen = line_blen;
    v->offset = offset;

    return 0;
}

faidx_t* fai_load_js(htsFile *f_fa, htsFile *f_fai, htsFile *f_gzi) {
    faidx_t *fai;
    char *p;
    int line_len, line_blen;
    int64_t len;
    uint64_t offset;
    fai = (faidx_t*)calloc(1, sizeof(faidx_t));
    fai->hash = kh_init(s);

    while (hts_getline(f_fai, KS_SEP_LINE, &f_fai->line) > 0) {
        for (p = f_fai->line.s; *p && isgraph_c(*p); ++p);
        *p = 0; ++p;
        sscanf(p, "%" SCNd64 "%" SCNu64 "%d%d", &len, &offset, &line_blen, &line_len);
        if (fai_insert_index(fai, f_fai->line.s, len, line_len, line_blen, offset) != 0) {
            return NULL;
        }
    }

    fai->bgzf = f_fa->fp.bgzf;

    if (fai->bgzf == 0) {
        fprintf(stderr, "[fai_load_js] fail to open FASTA file.\n");
        return 0;
    }

    if ( fai->bgzf->is_compressed==1 )
    {
        fprintf(stderr, "[fai_load_js] compressed FASTA file is not supported yet.\n");
        return 0;
        /* TODO: Interface for gzi
        if ( bgzf_index_load(fai->bgzf, fn, ".gzi") < 0 )
        {
            fprintf(stderr, "[fai_load_js] failed to load .gzi index: %s[.gzi]\n", fn);
            fai_destroy(fai);
            return NULL;
        }
        */
    }
    return fai;
}

void fai_destroy_js(faidx_t *fai) {
    //fai_destroy(fai);
}
