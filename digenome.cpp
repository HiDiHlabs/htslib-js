#include <stdio.h>
#include <stdlib.h>
#include <cstring>
#include <map>

#include "htslib/sam.h"

using namespace std;

void digenome(htsFile *fp, void (*callback)(char*, int) ) {
    uint32_t *cigar = (uint32_t *)malloc(500 * sizeof(uint32_t));
    uint32_t cigar_type;
    bam1_t *b = bam_init1();
    bam_hdr_t *header = sam_hdr_read(fp);

    int n_cigar, rtn, lpos = -1, rpos = -1, prev_tid = -1;
    int loop_var, i;
    bool rfound = false;

    int window_size = 1; // Analysis window size on each side

    map<int, int> rmap, found_lmap, found_rmap, depth_map;
    map<int, int>::iterator iter;

    int min_r = 5, min_l = 5; // Minimum number of reads start/end at the same position
    int min_depth_r = 10, min_depth_l = 10; // Minimum depth on each side
    int tmp, found_rpos, found_rcnt;
    int min_mapQ = 0;
    float min_ratio_r = 0.2f, min_ratio_l = 0.2f;

    while (1) {
        if(sam_read1(fp, header, b) < 0) break; // EOF
        if ( b->core.flag & (BAM_FUNMAP | BAM_FSECONDARY | BAM_FQCFAIL | BAM_FDUP) ) continue;
        if ( (int)b->core.qual < min_mapQ ) continue;

        if (b->core.tid != prev_tid) {
            for (iter=found_lmap.begin(); iter!=found_lmap.end(); iter++) {
                if (iter->second > min_l && depth_map[iter->first] > min_depth_l && ((float)min_l)/((float)depth_map[iter->first]) > min_ratio_l) {
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

        for (i=lpos; i<rpos+1; i++) {
            if (depth_map.find(i) == depth_map.end())
                depth_map[i] = 1;
            else
                depth_map[i]++;
        }

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
            if (lpos < found_rpos + window_size + 1 && min_depth_r < depth_map[found_rpos] && ((float)found_rcnt)/((float)depth_map[found_rpos]) > min_ratio_r) {
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
                if (iter->second > min_l && depth_map[iter->first] > min_depth_l && ((float)min_l)/((float)depth_map[iter->first]) > min_ratio_l) {
                    callback(header->target_name[b->core.tid], iter->first - 1);
                }
                found_lmap.erase(iter++);
            } else iter++;
        }

        for (iter=depth_map.begin(); iter!=depth_map.end(); ) {
            if (iter->first < lpos - window_size)
                depth_map.erase(iter++);
            else
                iter++;
        }
    }

    for (iter=found_lmap.begin(); iter!=found_lmap.end(); iter++) {
        if (iter->second > min_l && depth_map[iter->first] > min_depth_l && ((float)min_l)/((float)depth_map[iter->first]) > min_ratio_l) {
            callback(header->target_name[prev_tid], iter->first - 1);
        }
    }
 

    bam_destroy1(b);
    bam_hdr_destroy(header);

    free((void*)cigar);
}
