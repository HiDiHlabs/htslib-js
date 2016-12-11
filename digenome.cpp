#include <stdio.h>
#include <stdlib.h>
#include <cstring>
#include <map>

#include "htslib/sam.h"

using namespace std;

typedef struct {
    samFile *fp;
    bam_hdr_t *hdr;
    hts_itr_t *iter;
} mplp_data;

static int get_depth(int pos) {
    return 30;
}

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

void run_digenome(htsFile *fp, void (*callback)(char*, int) ) {
    uint32_t *cigar = (uint32_t *)malloc(500 * sizeof(uint32_t));
    uint32_t cigar_type;
    bam1_t *b = bam_init1();
    bam_hdr_t *header = sam_hdr_read(fp);

    int n_cigar, rtn, lpos = -1, rpos = -1, prev_tid = -1;
    int loop_var, i;
    bool rfound = false;

    int window_size = 1; // Analysis window size on each side

    map<int, int> rmap, found_lmap, found_rmap;
    map<int, int>::iterator iter;

    int min_r = 10, min_l = 10; // Minimum number of reads start/end at the same position
    int tmp, found_rpos, found_rcnt;

    while (1) {
        if(sam_read1(fp, header, b) < 0) break; // EOF

        if (b->core.tid != prev_tid) {
            for (iter=found_lmap.begin(); iter!=found_lmap.end(); iter++) {
                if (iter->second > min_l) {
                    //printf("Found cleavage at %s:%d\n", header->target_name[prev_tid], iter->first - 1);
                    callback(header->target_name[prev_tid], iter->first - 1);
                }
            }
            prev_tid = b->core.tid;
            rmap.clear();
            found_lmap.clear();
            found_rmap.clear();
            rfound = false;
            found_rpos = 0;
        }

        n_cigar = b->core.n_cigar;

        // Due to unaligned memory operation (not supported by Emscripten)
        // https://github.com/kripken/emscripten/issues/4774
        memcpy(cigar, bam_get_cigar(b), n_cigar*sizeof(uint32_t));
 
        lpos = rpos = b->core.pos;
        lpos++; rpos += bam_cigar2rlen(n_cigar, cigar); // 1-based coordinate

        if (rmap.find(rpos) == rmap.end())
            rmap[rpos] = 1;
        else {
            rmap[rpos]++;
            tmp = 0;
            for (i=0; i<window_size; i++) {
                if (rmap.find(rpos-i) != rmap.end()) {
                    tmp += rmap[rpos-i];
                }
            }
            if (tmp > min_r) {
                rfound = true;
                if (found_rpos < rpos)
                    found_rpos = rpos; // Updated several times - it will have largest value in the end
                found_rcnt = tmp;
            }
        }

        for (iter=rmap.begin(); iter!=rmap.end(); ) {
            if (iter->first < lpos)
                rmap.erase(iter++);
            else
                iter++;
        }

        if (rfound && found_rpos < lpos) {
            // This block will be executed only once after finding rpos
            if (lpos < found_rpos + window_size + 1) {
                found_rmap[found_rpos] = found_rcnt;
                found_lmap[found_rpos + 1] = 1;
            }
            rfound = false;
            found_rpos = 0;
        }

        for (iter=found_rmap.begin(); iter!=found_rmap.end(); ) {
            if (lpos < iter->first + window_size + 1) {
                found_lmap[iter->first + 1]++;
                iter++;
            } else {
                found_rmap.erase(iter++);
            }
        }

        for (iter=found_lmap.begin(); iter!=found_lmap.end(); ) {
            if (lpos > iter->first + window_size - 1) {
                if (iter->second > min_l) {
                    // printf("Found cleavage at %s:%d\n", header->target_name[b->core.tid], iter->first - 1);
                    callback(header->target_name[b->core.tid], iter->first - 1);
                }
                found_lmap.erase(iter++);
            } else iter++;
        }
    }

    for (iter=found_lmap.begin(); iter!=found_lmap.end(); iter++) {
        if (iter->second > min_l) {
            // printf("Found cleavage at %s:%d\n", header->target_name[prev_tid], iter->first - 1);
            callback(header->target_name[prev_tid], iter->first - 1);
        }
    }
 

    bam_destroy1(b);
    bam_hdr_destroy(header);

    /*
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
            else {
                memcpy(cigar, bam_get_cigar(p->b), b->core.n_cigar*sizeof(uint32_t));
            }
        }
        depth = n_plp - m;
        if (depth > 5) {
            fputs(data->hdr->target_name[tid], stdout);
            printf("\t%d\t%d\n", pos+1, depth);
        }
    }
    free((void*)plp);
    bam_mplp_destroy(mplp);
    free((void*)data);
    bam_hdr_destroy(hdr);
    */
    free((void*)cigar);
}
