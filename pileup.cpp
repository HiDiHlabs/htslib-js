#include <stdio.h>
#include <stdlib.h>

#include "htslib/sam.h"

typedef struct {
    samFile *fp;
    bam_hdr_t *hdr;
    hts_itr_t *iter;
} mplp_data;

static int read_bam(void *data, bam1_t *b) {
    mplp_data *aux = (mplp_data*)data; // data in fact is a pointer to an auxiliary structure
    int ret;
    while (1)
    {
        ret = aux->iter? sam_itr_next(aux->fp, aux->iter, b) : sam_read1(aux->fp, aux->hdr, b);
        if ( ret<0 ) break;
        if ( b->core.flag & (BAM_FUNMAP | BAM_FSECONDARY | BAM_FQCFAIL | BAM_FDUP) ) continue;
        //if ( (int)b->core.qual < aux->min_mapQ ) continue;
        break;
    }
    return ret;
}

void pileup(htsFile *fp, void (*callback)(char*, int, int) ) {
    bam_hdr_t *hdr = sam_hdr_read(fp);
    int cnt, ret, pos, qpos, tid, n_plp, depth, j;


    mplp_data *data = (mplp_data *)calloc(1, sizeof(mplp_data*));

    data->fp = fp;
    data->hdr = hdr;
    data->iter = NULL;

    bam_mplp_t mplp = bam_mplp_init(1, read_bam, (void**) &data);
    const bam_pileup1_t **plp = (const bam_pileup1_t **)calloc(1, sizeof(bam_pileup1_t *));

    cnt = 0;
    pos = 0;
    while ((ret=bam_mplp_auto(mplp, &tid, &pos, &n_plp, plp)) > 0) {
        if (tid >= data->hdr->n_targets) continue;
        int j, m = 0;
        for (j = 0; j < n_plp; ++j) {
            const bam_pileup1_t *p = plp[0] + j;
            if (p->is_del || p->is_refskip) ++m;
            else if (bam_get_qual(p->b)[p->qpos] < 20) ++m;
        }
        depth = n_plp - m;
        if (depth > 1000) {
            callback(data->hdr->target_name[tid], pos+1, depth);
        }
    }
    free((void*)plp);
    bam_mplp_destroy(mplp);
    free((void*)data);
    bam_hdr_destroy(hdr);
}
