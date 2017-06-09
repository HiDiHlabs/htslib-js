#include <iostream>
#include <getopt.h>
#include <stdlib.h>
#include <string>
#include "htslib/sam.h"

#include "pileup.h"

using namespace std;

void print_usage() {
    cout << "Pileup example (" << __DATE__ << ")" << endl <<
            endl <<
            "Usage: pileup [options] BAM_FILE" << endl <<
            "    -f                 --fasta                       Reference Fasta file (.fai is required)" << endl <<
            "    -r                 --reg                         Region to pileup (.bai is required)" << endl;
    exit(0);
}

void report_progress(const char* chrom, int pos, char ref_base, int depth) {
    cout << "Position: " << chrom << ":" << pos << ", Reference Base: " << ref_base << ", Depth: " << depth << endl;
}

int main(int argc, char* argv[]) {
    int min_d = 1000;
    int c;
    string reg = "", fasta = "";

    faidx_t *fai = NULL;
    hts_idx_t *bai = NULL;

    while (1) {
        static struct option long_options[] = {
            {"fasta", required_argument, 0, 'f'},
            {"reg", required_argument, 0, 'r'},
            {0, 0, 0, 0}
        };

        int option_index = 0;
        c = getopt_long(argc, argv, "f:r:", long_options, &option_index);

        if (c == -1) break;

        switch (c) {
            case 'f':
                fasta = string(optarg);
                break;
            case 'r':
                reg = string(optarg);
                break;
            default:
                print_usage();
        }
    }
    if (argc - optind != 1) print_usage();
    htsFile *fp = sam_open(argv[optind], "rb");

    bai = hts_idx_load((string(argv[optind]) + ".bai").c_str(), HTS_FMT_BAI);
    if (fasta.size() > 0)
        fai = fai_load(fasta.c_str());
    else
        fai = 0;

    pileup(fp, bai, fai, reg.c_str(), report_progress);
    sam_close(fp);

    if (fai) fai_destroy(fai);
    if (bai) hts_idx_destroy(bai);

    return 0;
}
