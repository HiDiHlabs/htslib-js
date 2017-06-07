#include "array.h"
#include "emscripten.h"
#include "htslib/vcf.h"

void rainfall(const char *filename) {
    // Initialise variables
    htsFile *file = bcf_open(filename, "r");
    bcf_hdr_t *hdr = bcf_hdr_read(file);
    bcf1_t *prv_entry = bcf_init();
    bcf1_t *nxt_entry = bcf_init();

    // Get the sequence names
    bcf_hdr_set_samples(hdr, NULL, 0);
    int nseq = 0;
    const char **seqnames = bcf_hdr_seqnames(hdr, &nseq);
    if (seqnames == NULL) {
        printf("No sequences found");
        exit(1);
    }

    // Read the file
    array_t *positions = malloc(sizeof(array_t) * nseq);
    array_t *distances = malloc(sizeof(array_t) * nseq);
    for (int i = 0; i < nseq; ++i) {
        array_init(&distances[i]);
    }
    if (bcf_read(file, hdr, prv_entry) != 0) {
        printf("No variants in file");
        exit(1);
    }
    while (bcf_read(file, hdr, nxt_entry) == 0) {
        if (prv_entry->rid != nxt_entry->rid) {
            printf("%d != %d\n", prv_entry->rid, nxt_entry->rid);
            prv_entry = nxt_entry;
            continue;
        }
        array_append(&(positions[prv_entry->rid]), prv_entry->pos);
        array_append(&(distances[prv_entry->rid]), nxt_entry->pos - prv_entry->pos);
        prv_entry = nxt_entry;
    }

    // Move data to browser
    for (int i = 0; i < nseq; ++i) {
        EM_ASM_({
            positions[Pointer_stringify($0)] = new Int32Array(Module.HEAP32, $1, $2);
            distances[Pointer_stringify($0)] = new Int32Array(Module.HEAP32, $3, $4);
        }, seqnames[i], positions[i].data, positions[i].size, distances[i].data, distances[i].size);
    }

    // Free memory
    bcf_destroy(prv_entry);
    bcf_destroy(nxt_entry);
    bcf_hdr_destroy(hdr);
    bcf_close(file);
    for (int i = 0; i < nseq; ++i) {
        array_free(&distances[i]);
    }
    free(distances);
}
