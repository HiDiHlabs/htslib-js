#include <stdio.h>
#include "htslib/sam.h"
#include "digenome.h"

void report_progress(int progress) {
 //printf("cnt: %d\n", progress);
}

int main(int argc, char **argv) {
    htsFile *fp = sam_open("./small_MB99.bam", "rb");
    run_digenome(fp, report_progress);
    sam_close(fp);
    return 0;
}
