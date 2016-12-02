#include "htslib/hfile.h"
#include "hfile_internal.h"

typedef struct {
    hFILE base;
    int fd;
} hFILE_js;

hFILE *hopen_js(int);
