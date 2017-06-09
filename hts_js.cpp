#include <string.h>
#include <stdlib.h>
#include <errno.h>

#include "htslib/hts.h"
#include "htslib/bgzf.h"
#include "htslib/cram.h"
#include "htslib/hfile.h"

#include "htslib/khash.h"
#include "htslib/kseq.h"

#include <iostream>
using namespace std;

#define META_BIN(idx) ((idx)->n_bins + 1)

KSTREAM_INIT2(, BGZF*, bgzf_read, 65536)

typedef struct {
    int32_t m, n;
    uint64_t loff;
    hts_pair64_t *list;
} bins_t;

KHASH_MAP_INIT_INT(bin, bins_t)
typedef khash_t(bin) bidx_t;

typedef struct {
    int32_t n, m;
    uint64_t *offset;
} lidx_t;

struct __hts_idx_t {
    int fmt, min_shift, n_lvls, n_bins;
    uint32_t l_meta;
    int32_t n, m;
    uint64_t n_no_coor;
    bidx_t **bidx;
    lidx_t *lidx;
    uint8_t *meta;
    struct {
        uint32_t last_bin, save_bin;
        int last_coor, last_tid, save_tid, finished;
        uint64_t last_off, save_off;
        uint64_t off_beg, off_end;
        uint64_t n_mapped, n_unmapped;
    } z; // keep internal states
};

htsFile *hts_hopen_js(struct hFILE* hfile, char *fn, const char* mode) {
    htsFile *fp = (htsFile*)calloc(1, sizeof(htsFile));
    char simple_mode[101], fasta_test;
    const char *cp;
    simple_mode[100] = '\0';

    if (fp == NULL) goto error;

    fp->fn = strdup(fn);
    fp->is_be = ed_is_big();

    // Split mode into simple_modeopts strings
    if ((cp = strchr(mode, ','))) {
        strncpy(simple_mode, mode, cp-mode <= 100 ? cp-mode : 100);
        simple_mode[cp-mode] = '\0';
    } else {
        strncpy(simple_mode, mode, 100);
    }

    if (strchr(simple_mode, 'r')) {
        if (hts_detect_format(hfile, &fp->format) < 0) goto error;
    } else { errno = EINVAL; goto error; }

    switch (fp->format.format) {
    case binary_format:
    case bam:
    case bcf:
        fp->fp.bgzf = bgzf_hopen(hfile, simple_mode);
        if (fp->fp.bgzf == NULL) goto error;
        fp->is_bin = 1;
        break;
    case cram:
        fp->fp.cram = cram_dopen(hfile, fn, simple_mode);
        if (fp->fp.cram == NULL) goto error;
        if (!fp->is_write)
            cram_set_option(fp->fp.cram, CRAM_OPT_DECODE_MD, 1);
        fp->is_cram = 1;
        break;

    case text_format:
    case sam:
    case vcf:
        if (hpeek(hfile, &fasta_test, 1) > 0 && fasta_test == '>') {
            fp->fp.bgzf = bgzf_hopen(hfile, simple_mode); // store bgzf for fasta format
        } else {
            BGZF *gzfp = bgzf_hopen(hfile, simple_mode);
            if (gzfp) fp->fp.voidp = ks_init(gzfp);
            else goto error;
        }
        break;

    case bai:
    case csi:
    case gzi:
    case tbi:
        fp->fp.hfile = hfile; // just store hfile. crai is currently determined as 'sam', not here
        break;

    default:
        goto error;
    }
    return fp;

error:
    printf("[E::%s] fail to open file '%s'\n", __func__, fn);

    if (fp) {
        free(fp->fn);
        free(fp->fn_aux);
        free(fp);
    }
    return NULL;
}

void hts_hclose_js(htsFile* fp) {
    if (fp) {
        free(fp->fn);
        free(fp->fn_aux);
        free(fp);
    }
}

static void update_loff(hts_idx_t *idx, int i, int free_lidx)
{
    bidx_t *bidx = idx->bidx[i];
    lidx_t *lidx = &idx->lidx[i];
    khint_t k;
    int l;
    uint64_t offset0 = 0;
    if (bidx) {
        k = kh_get(bin, bidx, META_BIN(idx));
        if (k != kh_end(bidx))
            offset0 = kh_val(bidx, k).list[0].u;
        for (l = 0; l < lidx->n && lidx->offset[l] == (uint64_t)-1; ++l)
            lidx->offset[l] = offset0;
    } else l = 1;
    for (; l < lidx->n; ++l) // fill missing values
        if (lidx->offset[l] == (uint64_t)-1)
            lidx->offset[l] = lidx->offset[l-1];
    if (bidx == 0) return;
    for (k = kh_begin(bidx); k != kh_end(bidx); ++k) // set loff
        if (kh_exist(bidx, k))
        {
            if ( kh_key(bidx, k) < idx->n_bins )
            {
                int bot_bin = hts_bin_bot(kh_key(bidx, k), idx->n_lvls);
                // disable linear index if bot_bin out of bounds
                kh_val(bidx, k).loff = bot_bin < lidx->n ? lidx->offset[bot_bin] : 0;
            }
            else
                kh_val(bidx, k).loff = 0;
        }
    if (free_lidx) {
        free(lidx->offset);
        lidx->m = lidx->n = 0;
        lidx->offset = 0;
    }
}

static inline void swap_bins(bins_t *p)
{
    int i;
    for (i = 0; i < p->n; ++i) {
        ed_swap_8p(&p->list[i].u);
        ed_swap_8p(&p->list[i].v);
    }
}

static int hts_idx_load_core(hts_idx_t *idx, BGZF *fp, int fmt)
{
    int32_t i, n, is_be;
    is_be = ed_is_big();
    if (idx == NULL) return -4;
    for (i = 0; i < idx->n; ++i) {
        bidx_t *h;
        lidx_t *l = &idx->lidx[i];
        uint32_t key;
        int j, absent;
        bins_t *p;
        h = idx->bidx[i] = kh_init(bin);
        if (bgzf_read(fp, &n, 4) != 4) return -1;
        if (is_be) ed_swap_4p(&n);
        for (j = 0; j < n; ++j) {
            khint_t k;
            if (bgzf_read(fp, &key, 4) != 4) return -1;
            if (is_be) ed_swap_4p(&key);
            k = kh_put(bin, h, key, &absent);
            if (absent <= 0) return -3; // Duplicate bin number
            p = &kh_val(h, k);
            if (fmt == HTS_FMT_CSI) {
                if (bgzf_read(fp, &p->loff, 8) != 8) return -1;
                if (is_be) ed_swap_8p(&p->loff);
            } else p->loff = 0;
            if (bgzf_read(fp, &p->n, 4) != 4) return -1;
            if (is_be) ed_swap_4p(&p->n);
            p->m = p->n;
            p->list = (hts_pair64_t*)malloc(p->m * sizeof(hts_pair64_t));
            if (p->list == NULL) return -2;
            if (bgzf_read(fp, p->list, p->n<<4) != p->n<<4) return -1;
            if (is_be) swap_bins(p);
        }
        if (fmt != HTS_FMT_CSI) { // load linear index
            int j;
            if (bgzf_read(fp, &l->n, 4) != 4) return -1;
            if (is_be) ed_swap_4p(&l->n);
            l->m = l->n;
            l->offset = (uint64_t*)malloc(l->n * sizeof(uint64_t));
            if (l->offset == NULL) return -2;
            if (bgzf_read(fp, l->offset, l->n << 3) != l->n << 3) return -1;
            if (is_be) for (j = 0; j < l->n; ++j) ed_swap_8p(&l->offset[j]);
            for (j = 1; j < l->n; ++j) // fill missing values; may happen given older samtools and tabix
                if (l->offset[j] == 0) l->offset[j] = l->offset[j-1];
            update_loff(idx, i, 1);
        }
    }
    if (bgzf_read(fp, &idx->n_no_coor, 8) != 8) idx->n_no_coor = 0;
    if (is_be) ed_swap_8p(&idx->n_no_coor);
    return 0;
}

hts_idx_t *hts_idx_load_js(htsFile* f) {
    uint8_t magic[4];
    int i, is_be;
    hts_idx_t *idx = NULL;
    uint8_t *meta = NULL;

    BGZF *fp = bgzf_hopen(f->fp.hfile, "r");
    if (fp == NULL) return NULL;
    is_be = ed_is_big();
    if (bgzf_read(fp, magic, 4) != 4) goto fail;

    if (memcmp(magic, "CSI\1", 4) == 0) {
        uint32_t x[3], n;
        if (bgzf_read(fp, x, 12) != 12) goto fail;
        if (is_be) for (i = 0; i < 3; ++i) ed_swap_4p(&x[i]);
        if (x[2]) {
            if ((meta = (uint8_t*)malloc(x[2])) == NULL) goto fail;
            if (bgzf_read(fp, meta, x[2]) != x[2]) goto fail;
        }
        if (bgzf_read(fp, &n, 4) != 4) goto fail;
        if (is_be) ed_swap_4p(&n);
        if ((idx = hts_idx_init(n, HTS_FMT_CSI, 0, x[0], x[1])) == NULL) goto fail;
        idx->l_meta = x[2];
        idx->meta = meta;
        meta = NULL;
        if (hts_idx_load_core(idx, fp, HTS_FMT_CSI) < 0) goto fail;
    }
    else if (memcmp(magic, "TBI\1", 4) == 0) {
        uint32_t x[8];
        if (bgzf_read(fp, x, 32) != 32) goto fail;
        if (is_be) for (i = 0; i < 8; ++i) ed_swap_4p(&x[i]);
        if ((idx = hts_idx_init(x[0], HTS_FMT_TBI, 0, 14, 5)) == NULL) goto fail;
        idx->l_meta = 28 + x[7];
        if ((idx->meta = (uint8_t*)malloc(idx->l_meta)) == NULL) goto fail;
        memcpy(idx->meta, &x[1], 28);
        if (bgzf_read(fp, idx->meta + 28, x[7]) != x[7]) goto fail;
        if (hts_idx_load_core(idx, fp, HTS_FMT_TBI) < 0) goto fail;
    }
    else if (memcmp(magic, "BAI\1", 4) == 0) {
        uint32_t n;
        if (bgzf_read(fp, &n, 4) != 4) goto fail;
        if (is_be) ed_swap_4p(&n);
        idx = hts_idx_init(n, HTS_FMT_BAI, 0, 14, 5);
        if (hts_idx_load_core(idx, fp, HTS_FMT_BAI) < 0) goto fail;
    }
    else { errno = EINVAL; goto fail; }

    return idx;

fail:
    bgzf_close(fp);
    hts_idx_destroy(idx);
    free(meta);
    return NULL;
}

void hts_idx_destroy_js(hts_idx_t *idx) {
    hts_idx_destroy(idx);
}
