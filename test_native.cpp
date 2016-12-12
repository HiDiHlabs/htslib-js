#include <stdio.h>
#include "htslib/sam.h"
#include "digenome.h"
#include "pileup.h"

void report_progress(char *chrom, int pos) {
 printf("Found cleavage position at %s:%d\n", chrom, pos);
}

void report_pileup(char *chrom, int pos, int depth) {
 printf("Found depth %d at %s:%d\n", depth, chrom, pos);
}

int main(int argc, char **argv) {
    htsFile *fp = sam_open("/data/small_MB99.bam", "rb");
    if (argv[1][0] == 48) { // "0"
        digenome(fp, report_progress);
    } else {
        pileup(fp, report_pileup);
    }
    sam_close(fp);
    return 0;
}
