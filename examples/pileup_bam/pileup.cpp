#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "htslib/sam.h"
#include "htslib/faidx.h"

typedef struct {
    samFile *fp;
    bam_hdr_t *hdr;
    hts_itr_t *iter;
    int min_mapQ;
} mplp_data;

static int read_bam(void *data, bam1_t *b) {
    mplp_data *aux = (mplp_data*)data;
    int ret;
    while (1)
    {
        ret = aux->iter? sam_itr_next(aux->fp, aux->iter, b) : sam_read1(aux->fp, aux->hdr, b);
        if ( ret<0 ) break;
        if ( b->core.flag & (BAM_FUNMAP | BAM_FSECONDARY | BAM_FQCFAIL | BAM_FDUP) ) continue;
        if ( (int)b->core.qual < aux->min_mapQ ) continue;
        break;
    }
    return ret;
}

void pileup(htsFile *fp, hts_idx_t* bai, faidx_t *fai, const char* reg, void (*callback)(const char*, int, char, int) ) {
    bam_hdr_t *hdr = sam_hdr_read(fp);
    int cnt, ret, pos, qpos, tid, n_plp, depth, j, m;
    char ref_base = 'N';
    const char *c_name;
    const bam_pileup1_t *p;

    mplp_data *data = (mplp_data *)calloc(1, sizeof(mplp_data));

    data->fp = fp;
    data->hdr = hdr;
    data->min_mapQ = 1;
    data->iter = (bai && strlen(reg) > 0)?sam_itr_querys(bai, hdr, reg): NULL;

    bam_mplp_t mplp = bam_mplp_init(1, read_bam, (void**) &data);

    const bam_pileup1_t **plp = (const bam_pileup1_t **)calloc(1, sizeof(bam_pileup1_t *));

    cnt = 0;
    pos = 0;
    while ((ret=bam_mplp_auto(mplp, &tid, &pos, &n_plp, plp)) > 0) {
        if (tid >= data->hdr->n_targets) continue;
        m = 0;
        for (j = 0; j < n_plp; ++j) {
            p = plp[0] + j;
            if (p->is_del || p->is_refskip) ++m;
            else if (bam_get_qual(p->b)[p->qpos] < 20) ++m;
        }
        depth = n_plp - m;
        c_name = data->hdr->target_name[tid];

        if (fai) ref_base = faidx_fetch_seq(fai, c_name, pos, pos, &m)[0];

        callback(c_name, pos+1, ref_base, depth);
    }
    bam_hdr_destroy(hdr);
    if(data->iter) hts_itr_destroy(data->iter);
    bam_mplp_destroy(mplp);
    free((void*)data);
    free((void*)plp);
}
