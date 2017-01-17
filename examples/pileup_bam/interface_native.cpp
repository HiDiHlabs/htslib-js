#include <iostream>
#include <getopt.h>
#include <stdlib.h>
#include "htslib/sam.h"

#include "pileup.h"

using namespace std;

void print_usage() {
    cout << "Pileup example (" << __DATE__ << ")" << endl <<
            endl <<
            "Copyright (c) 2016 Jeongbin Park" << endl <<
            endl <<
            "Usage: pileup [options] BAM_FILE" << endl <<
            "    -d depth           --min_depth=depth             Minimum depth (default: 1000)" << endl <<
            "    -h                 --help                        Print this message" << endl;
    exit(0);
}

void report_progress(char* chrom, int pos, int depth) {
    cout << "Position: " << chrom << ":" << pos << ", Depth: " << depth << endl;
}

int main(int argc, char* argv[]) {
    int min_d = 1000;
    int c;

    while (1) {
        static struct option long_options[] = {
            {"min-depth", required_argument, 0, 'd'},
            {"help", required_argument, 0, 'h'},
            {0, 0, 0, 0}
        };

        int option_index = 0;
        c = getopt_long(argc, argv, "d:h", long_options, &option_index);

        if (c == -1) break;

        switch (c) {
            case 'd':
                min_d = atoi(optarg);
                break;
            case 'h':
                break;
            default:
                print_usage();
        }
    }
    if (argc - optind != 1) print_usage();
    htsFile *fp = sam_open(argv[optind], "rb");
    pileup(fp, min_d, report_progress);
    sam_close(fp);
    return 0;
}
