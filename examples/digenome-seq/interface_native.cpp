#include <iostream>
#include <stdio.h>
#include <getopt.h>
#include <stdlib.h>
#include "htslib/sam.h"
#include "digenome.h"

using namespace std;

void report_progress(float p) {
    printf("Current progress: %.3f %%\n", p);
}

void report_cleavage(char *chrom, int pos, int f, int r, int fd, int rd, float fr, float rr, float sc) {
    printf("%s:%d\t%d\t%d\t%d\t%d\t%f\t%f\t%f\n", chrom, pos, f, r, fd, rd, fr, rr, sc);
}

void print_usage() {
    cout << "Digenome-seq standalone v1.0 (" << __DATE__ << ")" << endl <<
            endl <<
            "Copyright (c) 2016 Jeongbin Park" << endl <<
            endl <<
            "Usage: digenome [options] BAM_FILE" << endl <<
            "    -G overhang        --overhang=overhang         Length of sticky end overhang. Positive/negative value for 5'/3' overhang." << endl <<
            "    -q mapq            --min-mapq=mapq             Minimum mapping quality" << endl <<
            "    -f num_reads       --min-forward=num_reads     Minimum number of forward reads starts at the same position" << endl <<
            "    -r num_reads       --min-reverse=num_reads     Minimum number of reverse reads starts at the same position" << endl <<
            "    -d depth           --min-depth=depth           Minimum depth at each position" << endl <<
            "    -R ratio           --min-ratio=ratio           Minimum ratio at each position" << endl <<
            "    -s score           --min-score=score           Minimum cleavage score" << endl << 
            "    -h                 --help                      Print this message" << endl;
    exit(0);
}

int main(int argc, char **argv) {
    int G = 0;
    int min_mapq = 1;
    int min_f = 5;
    int min_r = 5;
    int min_d = 10;
    float min_R = 0.2;
    float min_s = 2.5;
    int c;

    while (1) {
        static struct option long_options[] = {
            {"overhang", required_argument, 0, 'G'},
            {"min-mapq", required_argument, 0, 'q'},
            {"min-forward", required_argument, 0, 'f'},
            {"min-reverse", required_argument, 0, 'r'},
            {"min-depth", required_argument, 0, 'd'},
            {"min-ratio", required_argument, 0, 'R'},
            {"min-score", required_argument, 0, 's'},
            {"help", required_argument, 0, 'h'},
            {0, 0, 0, 0}
        };
        
        int option_index = 0;
        c = getopt_long(argc, argv, "G:q:f:r:d:R:s:h", long_options, &option_index);

        if (c == -1) break;

        switch (c) {
            case 'G':
                G = atoi(optarg);
                break;
            case 'q':
                min_mapq = atoi(optarg);
                break;
            case 'f':
                min_f = atoi(optarg);
                break;
            case 'r':
                min_r = atoi(optarg);
                break;
            case 'd':
                min_d = atoi(optarg);
                break;
            case 'R':
                min_R = atof(optarg);
                break;
            case 's':
                min_s = atof(optarg);
                break;
            case 'h':
                break;
            default:
                print_usage();
        }
    }
    if (argc - optind != 1) print_usage();
    htsFile *fp = sam_open(argv[optind], "rb");
    digenome(fp, min_mapq, G, min_f, min_r, min_s, min_d, min_d, min_R, min_R, report_progress, report_cleavage);
    sam_close(fp);
    return 0;
}
