#include <stdio.h>
#include <stdlib.h>
#include <cstring>
#include <map>

#include "htslib/sam.h"

using namespace std;

int get_map(map<int, int> &m, int idx, int def = 0) {
    map<int, int>::iterator iter = m.find(idx);
    if (iter == m.end()) {
        return def;
    } else {
        return iter->second;
    }
}

float calc_score(int i, int overhang, map<int, int> &f, map<int, int> &r, map<int, int> &d) {
    float score = 0.0f;
    int a;
    for (a=1; a<6; a++) {
        score +=
          ((float)get_map(f, i)-1.0f) / ((float)get_map(d, i)) * ((float)get_map(r, i-4+overhang+a)-1.0f) / ((float)get_map(d, i-4+overhang+a)) * (get_map(f, i) + get_map(r, i-4+overhang+a) - 2.0f)
          +
          ((float)get_map(r, i-1+overhang) - 1.0f) / ((float)get_map(d, i-1+overhang)) * ((float)get_map(f, i-3+a) - 1.0f) / ((float)get_map(d, i-3+a) - 1.0f) * (get_map(r, i-1+overhang) + get_map(f, i-3+a) - 2.0f);
    }
    return score;
}

void inc_map(map<int, int> &m, int idx) {
    map<int, int>::iterator iter = m.find(idx);
    if (iter == m.end()) {
        m[idx] = 1;
    } else {
        m[idx]++;
    }
}

void check_cleavage(char* chrom, int pos, int overhang, int min_f, int min_r, float min_score, int min_depth_f, int min_depth_r, float min_ratio_f, float min_ratio_r, map<int, int> &fmap, map<int, int> &rmap, map<int, int> &dmap, void (*callback)(char*, int, int, int, int, int, float, float, float)) {
    int fpos, rpos, fcnt, rcnt, depth_f, depth_r;
    float ratio_f, ratio_r, score;
    map<int, int>::iterator iter;

    for (iter=fmap.begin(); (iter->first) <= pos && iter != fmap.end(); iter++) {
        fpos = iter->first;
        rpos = fpos - 1 + overhang;

        fcnt = iter->second;
        rcnt = get_map(rmap, rpos);

        depth_f = dmap[fpos];
        depth_r = dmap[rpos];

        ratio_f = ((float)fcnt)/((float)depth_f);
        ratio_r = ((float)rcnt)/((float)depth_r);

        score = calc_score(fpos, overhang, fmap, rmap, dmap);

        if (fcnt > min_f && rcnt > min_r && score > min_score && depth_f > min_depth_f && depth_r > min_depth_r && ratio_f > min_ratio_f && ratio_r > min_ratio_r) {
            callback(chrom, fpos, fcnt, rcnt, depth_f, depth_r, ratio_f, ratio_r, score);
        }
    }
}

void digenome(htsFile *fp, int min_mapq, int overhang, int min_f, int min_r, float min_score, int min_depth_f, int min_depth_r, float min_ratio_f, float min_ratio_r, void (*callback)(char*, int, int, int, int, int, float, float, float) ) {
    uint32_t *cigar = (uint32_t *)malloc(500 * sizeof(uint32_t));
    bam1_t *b = bam_init1();
    bam_hdr_t *header = sam_hdr_read(fp);

    int i, n_cigar, prev_tid = -1;
    int lpos, rpos, plpos = -1, min_for_pos, min_rev_pos, max_examin_pos;

    map<int, int> fmap, rmap, dmap;
    map<int, int>::iterator iter;

    //printf("Analysis started: %d, %d, %d, %d, %f, %d, %d, %f, %f\n", min_mapq, overhang, min_f, min_r, min_score, min_depth_f, min_depth_r, min_ratio_f, min_ratio_r);
    while (1) {
        if ( sam_read1(fp, header, b) < 0 ) break; // EOF
        if ( b->core.flag & (BAM_FUNMAP | BAM_FSECONDARY | BAM_FQCFAIL | BAM_FDUP) ) continue;
        if ( (int)b->core.qual < min_mapq ) continue;

        if (b->core.tid != prev_tid) {
            check_cleavage(header->target_name[prev_tid], lpos-2, overhang, min_f, min_r, min_score, min_depth_f, min_depth_r, min_ratio_f, min_ratio_r, fmap, rmap, dmap, callback);
            prev_tid = b->core.tid;
        }

        n_cigar = b->core.n_cigar;

        // Due to unaligned memory operation
        // https://github.com/kripken/emscripten/issues/4774 
        memcpy(cigar, (uint8_t *)bam_get_cigar(b), n_cigar*sizeof(uint32_t));

        lpos = b->core.pos+1;
        rpos = b->core.pos + bam_cigar2rlen(n_cigar, cigar);

        if (bam_is_rev(b)) {
            inc_map(rmap, rpos); // 1-based coordinate
        } else {
            if (plpos != lpos) {
                if (overhang > 0)
                    max_examin_pos = lpos-overhang-2;
                else
                    max_examin_pos = lpos-3;

                check_cleavage(header->target_name[b->core.tid], max_examin_pos, overhang, min_f, min_r, min_score, min_depth_f, min_depth_r, min_ratio_f, min_ratio_r, fmap, rmap, dmap, callback);

                for (iter=fmap.begin(); (iter->first) <= max_examin_pos && iter != fmap.end(); ) // map is always sorted by its key (http://www.cplusplus.com/reference/map/map/)
                    fmap.erase(iter++);

                for (iter=rmap.begin(); (iter->first) <= max_examin_pos+overhang && iter != rmap.end(); )
                    rmap.erase(iter++);

                min_for_pos = max_examin_pos-2;
                min_rev_pos = max_examin_pos-3+overhang;
                for (iter=dmap.begin(); (iter->first) <= (min_for_pos<min_rev_pos?min_for_pos:min_rev_pos) && iter != dmap.end(); )
                    dmap.erase(iter++);

                plpos = lpos;
            }
            inc_map(fmap, lpos);
        }
        for (i=lpos; i<rpos+1; i++)
            inc_map(dmap, i);
    }

    check_cleavage(header->target_name[b->core.tid], lpos, overhang, min_f, min_r, min_score, min_depth_f, min_depth_r, min_ratio_f, min_ratio_r, fmap, rmap, dmap, callback);

    bam_destroy1(b);
    bam_hdr_destroy(header);

    free((void*)cigar);
}
