#include "htslib/hts.h"
#include "htslib/bgzf.h"

#include <string.h>
#include <stdlib.h>

htsFile *hts_hopen_js(struct hFILE* hfile, char *fn, const char* mode) {
    htsFile *fp = (htsFile*)calloc(1, sizeof(htsFile));
    char simple_mode[101], *cp, *opts;
    simple_mode[100] = '\0';

    if (fp == NULL) goto error;

    fp->fn = strdup(fn);
    fp->is_be = ed_is_big();

    // Split mode into simple_modeopts strings
    if ((cp = strchr(mode, ','))) {
        strncpy(simple_mode, mode, cp-mode <= 100 ? cp-mode : 100);
        simple_mode[cp-mode] = '\0';
        opts = cp+1;
    } else {
        strncpy(simple_mode, mode, 100);
        opts = NULL;
    }

    if (strchr(simple_mode, 'r')) {
        if (hts_detect_format(hfile, &fp->format) < 0) goto error;
    } else { goto error; }

    switch (fp->format.format) {
    case binary_format:
    case bam:
    case bcf:
        fp->fp.bgzf = bgzf_hopen(hfile, simple_mode);
        if (fp->fp.bgzf == NULL) goto error;
        fp->is_bin = 1;
        break;
/*
    case cram:
        fp->fp.cram = cram_dopen(hfile, fn, simple_mode);
        if (fp->fp.cram == NULL) goto error;
        if (!fp->is_write)
            cram_set_option(fp->fp.cram, CRAM_OPT_DECODE_MD, 1);
        fp->is_cram = 1;
        break;

    case text_format:
    case sam:
    case vcf:
        if (!fp->is_write) {
            BGZF *gzfp = bgzf_hopen(hfile, simple_mode);
            if (gzfp) fp->fp.voidp = ks_init(gzfp);
            else goto error;
        }
        else if (fp->format.compression != no_compression) {
            fp->fp.bgzf = bgzf_hopen(hfile, simple_mode);
            if (fp->fp.bgzf == NULL) goto error;
        }
        else
            fp->fp.hfile = hfile;
        break;
*/
    default:
        goto error;
    }

    //if (opts)
    //    hts_process_opts(fp, opts);

    return fp;

error:
    printf("[E::%s] fail to open file '%s'\n", __func__, fn);

    if (fp) {
        free(fp->fn);
        free(fp->fn_aux);
        free(fp);
    }
    return NULL;
}

void hts_hclose_js(htsFile* fp) {
    free(fp);
}
