#include "emscripten.h"
#include "htslib/vcf.h"

int *get_nvar(const char* filename, int nseq) {
    htsFile *file = bcf_open(filename, "r");
    bcf_hdr_t *hdr = bcf_hdr_read(file);
    bcf1_t *entry = bcf_init();

    int *nvar = (int *) malloc(sizeof(int) * nseq);
    for (int i = 0; i < nseq; ++i) {
        nvar[i] = 0;
    }
    while (bcf_read(file, hdr, entry) == 0) {
        nvar[entry->rid] += 1;
    }

    bcf_destroy(entry);
    bcf_hdr_destroy(hdr);
    bcf_close(file);
    return nvar;
}

void rainfall(const char *filename) {
    // Initialise variables
    htsFile *file = bcf_open(filename, "r");
    bcf_hdr_t *hdr = bcf_hdr_read(file);
    bcf1_t *prv_entry = bcf_init();
    bcf1_t *nxt_entry = bcf_init();
    bcf1_t *swp_entry;

    // Get the sequence names
    bcf_hdr_set_samples(hdr, NULL, 0);
    int nseq = 0;
    const char **seqnames = bcf_hdr_seqnames(hdr, &nseq);
    if (seqnames == NULL) {
        printf("No sequences found");
        exit(1);
    }

    // Assign memory for positions and distances
    int *nvar = get_nvar(filename, nseq);
    int **positions = (int **) malloc(sizeof(int *) * nseq);
    int **distances = (int **) malloc(sizeof(int *) * nseq);
    for (int i = 0; i < nseq; ++i) {
        positions[i] = (int *) malloc(sizeof(int) * nvar[i]);
        distances[i] = (int *) malloc(sizeof(int) * nvar[i]);
    }

    // Iterator over variants
    int cvar = 0;
    if (bcf_read(file, hdr, prv_entry) != 0) {
        printf("No variants in file");
        exit(1);
    }
    while (bcf_read(file, hdr, nxt_entry) == 0) {
        if (prv_entry->rid != nxt_entry->rid) {
            swp_entry = prv_entry;
            prv_entry = nxt_entry;
            nxt_entry = swp_entry;
            cvar = 0;
            continue;
        }
        positions[prv_entry->rid][cvar] = prv_entry->pos;
        distances[prv_entry->rid][cvar] = nxt_entry->pos - prv_entry->pos;
        swp_entry = prv_entry;
        prv_entry = nxt_entry;
        nxt_entry = swp_entry;
        cvar += 1;
    }

    // Move data to browser
    for (int i = 0; i < nseq; ++i) {
        EM_ASM_({
            chromosomes[$0] = new Object();
            chromosomes[$0].name = Pointer_stringify($1);
            chromosomes[$0].x = new Int32Array(Module.HEAP32.buffer, $2, $4);
            chromosomes[$0].y = new Int32Array(Module.HEAP32.buffer, $3, $4);
        }, i, seqnames[i], positions[i], distances[i], nvar[i] - 1);
    }

    // Free memory
    bcf_destroy(prv_entry);
    bcf_destroy(nxt_entry);
    bcf_hdr_destroy(hdr);
    bcf_close(file);

    for (int i = 0; i < nseq; ++i) {
        free(positions[i]);
        free(distances[i]);
    }
    free(distances);
    free(positions);
    free(nvar);
}
