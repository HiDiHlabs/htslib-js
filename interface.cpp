#include "hts_js.h"
#include "hfile_js.h"

#include <emscripten.h>
#include <htslib/sam.h>
#include <htslib/kstring.h>
#include <stdlib.h>
#include <string.h>
#include <map>
#include <stdio.h>

std::map<int, htsFile*> file_map;

extern "C" {

int bgzf_open_js(int fid) {
    if (file_map.find(fid) != file_map.end()) return 1;

    hFILE* h_bam = hopen_js(fid);
    char *fn = (char *)EM_ASM_INT({
        return allocate(intArrayFromString(htsfiles[$0].fileobj.name), 'i8', ALLOC_NORMAL);
    }, fid);

    htsFile* bam = hts_hopen_js(h_bam, fn, "rb");
    free((void *)fn);
    file_map[fid] = bam;

    return 0;
}

void bgzf_close_js(int fd) {
    hts_close(file_map[fd]); // TODO: incompatible?
    delete file_map[fd];
}

int test(int fd) {
    bam_hdr_t *header = NULL;
    bam1_t *b= NULL;

    header = sam_hdr_read(file_map[fd]);
    b = bam_init1();

    int rtn, qlen;
    uint8_t *seq;
    int8_t *buf;

    int max_buf = 0;
    int i;
    int loop_var;

    for (int loop_var = 0; loop_var < 100; loop_var++) {
        rtn = sam_read1(file_map[fd], header, b);

        qlen = b->core.l_qseq;
        seq = bam_get_seq(b);
        if (max_buf < qlen + 1) {
            max_buf = qlen + 1;
            kroundup32(max_buf);
            buf = (int8_t *)realloc(buf, max_buf);
        }
        for (i = 0; i < qlen; ++i)
            buf[i] = seq_nt16_str[bam_seqi(seq, i)];

        printf("%s, %s\n", bam_get_qname(b), (char*)buf);
    }

    free(buf);
    bam_destroy1(b);
    bam_hdr_destroy(header);

    return rtn;
}

}
/*
int main(int argc,char** argv) {
    hts_itr_t *iter=NULL;
    hts_idx_t *idx=NULL;
    samFile *in = NULL;
    bam1_t *b= NULL;
    bam_hdr_t *header = NULL;
    if(argc!=3) return -1;

    in = sam_open(argv[1], "r");
    if(in==NULL) return -1;
    if ((header = sam_hdr_read(in)) == 0) return -1;
    idx = sam_index_load(in,  argv[1]);
    if(idx==NULL) return -1;
    iter  = sam_itr_querys(idx, header, argv[2]); 
    if(iter==NULL) return -1;
    b = bam_init1();
    while ( sam_itr_next(in, iter, b) >= 0) 
      {
      fputs("DO STUFF\n",stdout); 
      }
    hts_itr_destroy(iter);
    bam_destroy1(b);
    bam_hdr_destroy(header);
    sam_close(in);
        return 0;
    }

*/
