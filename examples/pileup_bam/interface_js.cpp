#include <emscripten.h>

#include "interface.h"
#include "pileup.h" 

#include <iostream>

void callback_pileup(char *chrom, int pos, int depth) {
    EM_ASM_ARGS({
        postMessage([2, Pointer_stringify($0), $1, $2]); // The first argument is for message classification, 0 and 1 are already reserved internally
    }, chrom, pos, depth);
}

extern "C" {
    int run_pileup(int fd, int min_depth) {
        pileup(htsFiles[fd], min_depth, callback_pileup);
        return 0;
    }
}
